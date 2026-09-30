// ------------------------------------------------------------
// server.js — the brain of the game.
//
// The server keeps track of every room, every player, the secret
// rules and the scores. Players' browsers connect to it with
// Socket.IO so everyone sees updates instantly.
//
// Run it with:  npm start
// Then open:    http://localhost:3000
// ------------------------------------------------------------

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { RULES, PROMPTS, pickRandom } = require("./rules");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve everything in the "public" folder (our web page)
app.use(express.static("public"));

// ---------------- Game settings ----------------
const MIN_PLAYERS = 3; // need at least 1 Rule Keeper + 2 guessers
const TURNS_PER_ROUND = 5; // prompts before the Rule Keeper wins
const POINTS_FOLLOW_RULE = 1; // guesser's answer follows the rule
const POINTS_CRACK_RULE = 5; // guesser figures out the rule
const POINTS_KEEPER_SURVIVES = 4; // nobody cracked the rule

// All rooms live here, looked up by their 4-letter code
const rooms = {};

// ---------------- Helpers ----------------

function makeRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O (they look like 1 and 0)
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += letters[Math.floor(Math.random() * letters.length)];
    }
  } while (rooms[code]);
  return code;
}

let nextPlayerId = 1;
function makePlayerId() {
  return "p" + nextPlayerId++;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanText(text, maxLength) {
  return String(text || "").trim().slice(0, maxLength);
}

function findPlayer(room, pid) {
  return room.players.find((p) => p.pid === pid);
}

function connectedPlayers(room) {
  return room.players.filter((p) => p.connected);
}

// Pick something from a list we haven't used yet this game
function pickUnused(list, usedIndexes) {
  if (usedIndexes.length >= list.length) usedIndexes.length = 0; // start over
  const options = list.map((_, i) => i).filter((i) => !usedIndexes.includes(i));
  const index = pickRandom(options);
  usedIndexes.push(index);
  return index;
}

// ---------------- Game flow ----------------

function startGame(room) {
  room.players.forEach((p) => (p.score = 0));
  room.keeperOrder = shuffle(connectedPlayers(room).map((p) => p.pid));
  room.roundNumber = 0;
  room.totalRounds = room.keeperOrder.length; // everyone is Rule Keeper once
  room.usedRules = [];
  room.usedPrompts = [];
  startNextRound(room);
}

function startNextRound(room) {
  // Find the next Rule Keeper who is still connected
  let keeper = null;
  while (room.roundNumber < room.totalRounds && !keeper) {
    const pid = room.keeperOrder[room.roundNumber];
    room.roundNumber++;
    const p = findPlayer(room, pid);
    if (p && p.connected) keeper = p;
  }

  if (!keeper || connectedPlayers(room).length < 2) {
    room.phase = "gameOver";
    return;
  }

  room.keeperPid = keeper.pid;
  room.ruleIndex = pickUnused(RULES, room.usedRules);
  room.turn = 0;
  room.history = []; // every turn's answers this round
  room.guesses = []; // every guess made this round
  room.roundResult = null;
  startNextTurn(room);
}

function startNextTurn(room) {
  room.turn++;
  room.prompt = PROMPTS[pickUnused(PROMPTS, room.usedPrompts)];
  room.answers = {}; // pid -> answer text
  room.guessedThisTurn = []; // pids who already guessed this turn
  room.phase = "answering";
}

// Everyone has answered: show the answers with ✓ or ✗
function revealAnswers(room) {
  const rule = RULES[room.ruleIndex];
  const entries = [];

  // Rule Keeper's example goes first
  const keeper = findPlayer(room, room.keeperPid);
  if (room.answers[room.keeperPid] !== undefined) {
    entries.push({
      name: keeper ? keeper.name : "Rule Keeper",
      answer: room.answers[room.keeperPid],
      follows: true,
      isKeeper: true,
    });
  }

  for (const p of room.players) {
    if (p.pid === room.keeperPid) continue;
    const answer = room.answers[p.pid];
    if (answer === undefined) continue;
    const follows = rule.check(answer);
    if (follows) p.score += POINTS_FOLLOW_RULE;
    entries.push({ name: p.name, answer, follows, isKeeper: false });
  }

  room.history.push({ turn: room.turn, prompt: room.prompt, entries });
  room.phase = "reveal";
}

function endRound(room, winner, reason) {
  const keeper = findPlayer(room, room.keeperPid);
  if (winner) {
    winner.score += POINTS_CRACK_RULE;
  } else if (reason === "survived" && keeper) {
    keeper.score += POINTS_KEEPER_SURVIVES;
  }
  room.roundResult = {
    ruleText: RULES[room.ruleIndex].text,
    winnerName: winner ? winner.name : null,
    keeperName: keeper ? keeper.name : "The Rule Keeper",
    reason, // "cracked", "survived" or "keeperLeft"
  };
  room.phase = "roundOver";
}

// If everyone still here has answered, move on automatically
function checkAllAnswered(room) {
  if (room.phase !== "answering") return;
  const waiting = connectedPlayers(room).filter((p) => room.answers[p.pid] === undefined);
  if (waiting.length === 0) revealAnswers(room);
}

// ---------------- What each player is allowed to see ----------------

function viewFor(room, me) {
  const isKeeper = me.pid === room.keeperPid;
  const inRound = ["answering", "reveal"].includes(room.phase);
  const showRule = isKeeper || room.phase === "roundOver";

  return {
    code: room.code,
    phase: room.phase,
    minPlayers: MIN_PLAYERS,
    you: { pid: me.pid, name: me.name, isHost: me.pid === room.hostPid, isKeeper },
    players: room.players.map((p) => ({
      name: p.name,
      score: p.score,
      connected: p.connected,
      isHost: p.pid === room.hostPid,
      isKeeper: inRound || room.phase === "roundOver" ? p.pid === room.keeperPid : false,
      answered: room.phase === "answering" && room.answers[p.pid] !== undefined,
    })),
    keeperName: (findPlayer(room, room.keeperPid) || {}).name,
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    turn: room.turn,
    turnsPerRound: TURNS_PER_ROUND,
    prompt: room.prompt,
    rule: showRule && room.ruleIndex !== undefined ? RULES[room.ruleIndex].text : null,
    myAnswer: room.answers ? room.answers[me.pid] : undefined,
    history: room.history || [],
    // Everyone sees judged guesses. Pending ones are only shown to the
    // Rule Keeper (who judges them) and to the person who made them.
    guesses: (room.guesses || [])
      .filter((g) => g.status !== "pending" || isKeeper || g.pid === me.pid)
      .map((g) => ({ id: g.id, name: g.name, text: g.text, status: g.status, mine: g.pid === me.pid })),
    canGuess: inRound && !isKeeper && !(room.guessedThisTurn || []).includes(me.pid),
    roundResult: room.roundResult,
    points: {
      follow: POINTS_FOLLOW_RULE,
      crack: POINTS_CRACK_RULE,
      survive: POINTS_KEEPER_SURVIVES,
    },
  };
}

// Send every player their own personal view of the room
function broadcast(room) {
  for (const p of room.players) {
    if (p.connected) io.to(p.socketId).emit("state", viewFor(room, p));
  }
}

// ---------------- Socket.IO: messages from players ----------------

io.on("connection", (socket) => {
  // Remember which room and player this browser belongs to
  let room = null;
  let me = null;

  function joinAs(targetRoom, name) {
    room = targetRoom;
    me = { pid: makePlayerId(), socketId: socket.id, name, score: 0, connected: true };
    room.players.push(me);
    socket.join(room.code);
  }

  socket.on("createRoom", (data, reply) => {
    const name = cleanText(data && data.name, 16);
    if (!name) return reply({ error: "Please enter your name." });

    const code = makeRoomCode();
    rooms[code] = { code, players: [], phase: "lobby", hostPid: null };
    joinAs(rooms[code], name);
    rooms[code].hostPid = me.pid;
    reply({ ok: true });
    broadcast(room);
  });

  socket.on("joinRoom", (data, reply) => {
    const name = cleanText(data && data.name, 16);
    const code = cleanText(data && data.code, 4).toUpperCase();
    if (!name) return reply({ error: "Please enter your name." });
    const target = rooms[code];
    if (!target) return reply({ error: "No room with code " + code + "." });

    const sameName = target.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (sameName && sameName.connected) {
      return reply({ error: "Someone in that room already has that name." });
    }

    if (sameName) {
      // A player who dropped out is coming back: give them their spot again
      room = target;
      me = sameName;
      me.socketId = socket.id;
      me.connected = true;
      socket.join(room.code);
    } else {
      joinAs(target, name);
    }
    reply({ ok: true });
    broadcast(room);
  });

  socket.on("startGame", () => {
    if (!room || me.pid !== room.hostPid || room.phase !== "lobby") return;
    if (connectedPlayers(room).length < MIN_PLAYERS) return;
    startGame(room);
    broadcast(room);
  });

  socket.on("submitAnswer", (data, reply) => {
    reply = reply || (() => {});
    if (!room || room.phase !== "answering") return;
    const answer = cleanText(data && data.answer, 40);
    if (!answer) return reply({ error: "Type an answer first." });
    if (room.answers[me.pid] !== undefined) return reply({ error: "You already answered." });

    // The Rule Keeper's example MUST follow the rule
    if (me.pid === room.keeperPid && !RULES[room.ruleIndex].check(answer)) {
      return reply({ error: "That doesn't follow your secret rule! Try another answer." });
    }

    room.answers[me.pid] = answer;
    reply({ ok: true });
    checkAllAnswered(room);
    broadcast(room);
  });

  // Rule Keeper can reveal early if someone is taking forever
  socket.on("forceReveal", () => {
    if (!room || room.phase !== "answering" || me.pid !== room.keeperPid) return;
    if (room.answers[me.pid] === undefined) return; // keeper must answer first
    revealAnswers(room);
    broadcast(room);
  });

  socket.on("guessRule", (data, reply) => {
    reply = reply || (() => {});
    if (!room || !["answering", "reveal"].includes(room.phase)) return;
    if (me.pid === room.keeperPid) return;
    if (room.guessedThisTurn.includes(me.pid)) {
      return reply({ error: "You can only guess once per prompt." });
    }
    const text = cleanText(data && data.guess, 80);
    if (!text) return reply({ error: "Type a guess first." });

    room.guessedThisTurn.push(me.pid);
    room.guesses.push({
      id: room.guesses.length + 1,
      pid: me.pid,
      name: me.name,
      text,
      status: "pending",
    });
    reply({ ok: true });
    broadcast(room);
  });

  // Rule Keeper decides if a guess is right
  socket.on("judgeGuess", (data) => {
    if (!room || me.pid !== room.keeperPid) return;
    if (!["answering", "reveal"].includes(room.phase)) return;
    const guess = room.guesses.find((g) => g.id === (data && data.id));
    if (!guess || guess.status !== "pending") return;

    if (data.correct) {
      guess.status = "correct";
      endRound(room, findPlayer(room, guess.pid), "cracked");
    } else {
      guess.status = "wrong";
    }
    broadcast(room);
  });

  // Rule Keeper moves on to the next prompt
  socket.on("nextTurn", () => {
    if (!room || room.phase !== "reveal" || me.pid !== room.keeperPid) return;
    // Don't move on while guesses are waiting to be judged
    if (room.guesses.some((g) => g.status === "pending")) return;
    if (room.turn >= TURNS_PER_ROUND) {
      endRound(room, null, "survived");
    } else {
      startNextTurn(room);
    }
    broadcast(room);
  });

  socket.on("nextRound", () => {
    if (!room || room.phase !== "roundOver" || me.pid !== room.hostPid) return;
    startNextRound(room);
    broadcast(room);
  });

  socket.on("backToLobby", () => {
    if (!room || room.phase !== "gameOver" || me.pid !== room.hostPid) return;
    room.players = room.players.filter((p) => p.connected);
    room.players.forEach((p) => (p.score = 0));
    room.phase = "lobby";
    room.keeperPid = null;
    broadcast(room);
  });

  socket.on("disconnect", () => {
    if (!room || !me) return;

    if (room.phase === "lobby") {
      room.players = room.players.filter((p) => p.pid !== me.pid);
    } else {
      me.connected = false; // keep their score in case they come back
    }

    // Everyone left: delete the room
    if (connectedPlayers(room).length === 0) {
      delete rooms[room.code];
      return;
    }

    // Host left: give the host job to someone else
    if (room.hostPid === me.pid) {
      room.hostPid = connectedPlayers(room)[0].pid;
    }

    // Rule Keeper left mid-round: end the round
    if (me.pid === room.keeperPid && ["answering", "reveal"].includes(room.phase)) {
      endRound(room, null, "keeperLeft");
    }

    checkAllAnswered(room);
    broadcast(room);
  });
});

// ---------------- Start the server ----------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Fake Rule is running! Open http://localhost:" + PORT);
});
