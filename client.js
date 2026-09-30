// ------------------------------------------------------------
// client.js — runs in each player's browser.
//
// It sends what the player does (create room, answer, guess...)
// to the server, and redraws the page every time the server
// sends a new "state".
// ------------------------------------------------------------

const socket = io(); // connect to our server

// Shortcut for finding elements on the page
const $ = (id) => document.getElementById(id);

// The latest game state from the server
let state = null;

// ---------------- Small helpers ----------------

// Show one screen and hide the rest
function showScreen(name) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.add("hidden"));
  $("screen-" + name).classList.remove("hidden");
}

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}

// Safely put user-typed text on the page (stops people injecting HTML)
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Pressing Enter in an input clicks its button
function enterClicks(inputId, buttonId) {
  $(inputId).addEventListener("keydown", (e) => {
    if (e.key === "Enter") $(buttonId).click();
  });
}

function sortedPlayers() {
  return [...state.players].sort((a, b) => b.score - a.score);
}

function scoreListHtml() {
  return sortedPlayers()
    .map((p) => {
      const tags = [];
      if (p.isKeeper) tags.push('<span class="tag keeper">Rule Keeper</span>');
      if (!p.connected) tags.push('<span class="tag off">left</span>');
      const you = p.name === state.you.name ? " (you)" : "";
      return `<li class="${p.connected ? "" : "faded"}">
        <span>${escapeHtml(p.name)}${you} ${tags.join(" ")}</span>
        <b>${p.score}</b>
      </li>`;
    })
    .join("");
}

// ---------------- Home screen buttons ----------------

// Remember the player's name between visits.
// (try/catch because some browsers block saving, like private mode)
try {
  $("name-input").value = localStorage.getItem("fakeRuleName") || "";
} catch (e) {}

function getName() {
  const name = $("name-input").value.trim();
  try {
    localStorage.setItem("fakeRuleName", name);
  } catch (e) {}
  return name;
}

$("create-btn").onclick = () => {
  socket.emit("createRoom", { name: getName() }, (res) => {
    $("home-error").textContent = res.error || "";
  });
};

$("join-btn").onclick = () => {
  const code = $("code-input").value.trim().toUpperCase();
  socket.emit("joinRoom", { name: getName(), code }, (res) => {
    $("home-error").textContent = res.error || "";
  });
};

enterClicks("code-input", "join-btn");

// If the link has ?room=ABCD in it, fill in the code for them
const roomFromLink = new URLSearchParams(location.search).get("room");
if (roomFromLink) $("code-input").value = roomFromLink.toUpperCase();

// ---------------- Lobby buttons ----------------

$("start-btn").onclick = () => socket.emit("startGame");

// ---------------- Game buttons ----------------

$("answer-btn").onclick = () => {
  const answer = $("answer-input").value;
  socket.emit("submitAnswer", { answer }, (res) => {
    $("answer-error").textContent = res.error || "";
    if (res.ok) $("answer-input").value = "";
  });
};
enterClicks("answer-input", "answer-btn");

$("guess-btn").onclick = () => {
  const guess = $("guess-input").value;
  socket.emit("guessRule", { guess }, (res) => {
    $("guess-error").textContent = res.error || "";
    if (res.ok) $("guess-input").value = "";
  });
};
enterClicks("guess-input", "guess-btn");

$("reveal-btn").onclick = () => socket.emit("forceReveal");
$("next-turn-btn").onclick = () => socket.emit("nextTurn");
$("next-round-btn").onclick = () => socket.emit("nextRound");
$("again-btn").onclick = () => socket.emit("backToLobby");

// The Rule Keeper's ✓ / ✗ buttons are created on the fly,
// so we listen for clicks on the whole list instead
$("judge-list").onclick = (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  socket.emit("judgeGuess", {
    id: Number(button.dataset.id),
    correct: button.dataset.correct === "yes",
  });
};

// ---------------- Drawing each screen ----------------

function drawLobby() {
  showScreen("lobby");
  $("lobby-code").textContent = state.code;
  $("lobby-players").innerHTML = state.players
    .map((p) => `<li>${escapeHtml(p.name)}${p.isHost ? ' <span class="tag">host</span>' : ""}</li>`)
    .join("");

  const enough = state.players.length >= state.minPlayers;
  show("start-btn", state.you.isHost);
  $("start-btn").disabled = !enough;

  if (!enough) {
    const needed = state.minPlayers - state.players.length;
    $("lobby-status").textContent = `Waiting for ${needed} more player${needed === 1 ? "" : "s"}...`;
  } else if (!state.you.isHost) {
    $("lobby-status").textContent = "Waiting for the host to start...";
  } else {
    $("lobby-status").textContent = "";
  }
}

function drawGame() {
  showScreen("game");
  const you = state.you;
  const answering = state.phase === "answering";
  const answered = state.myAnswer !== undefined;

  // Top bar
  $("game-code").textContent = state.code;
  $("round-info").textContent = `Round ${state.roundNumber} of ${state.totalRounds}`;
  $("turn-info").textContent = `Prompt ${state.turn} of ${state.turnsPerRound}`;

  // Banner: who knows the rule
  if (you.isKeeper) {
    $("keeper-banner").className = "banner keeper";
    $("keeper-banner").innerHTML =
      `<p class="small-label">You're the Rule Keeper. Your secret rule:</p>
       <p class="rule-text">${escapeHtml(state.rule)}</p>
       <p class="small">Give answers that follow it, and judge people's guesses.</p>`;
  } else {
    $("keeper-banner").className = "banner";
    $("keeper-banner").innerHTML =
      `<b>${escapeHtml(state.keeperName)}</b> knows the secret rule. Watch the ✓ and ✗ to figure it out!`;
  }

  // Prompt and answer box
  $("prompt-text").textContent = state.prompt;
  show("answer-area", answering && !answered);
  $("answer-input").placeholder = you.isKeeper ? "An answer that follows your rule" : "Your answer";

  // Status line under the prompt
  if (answering) {
    const waiting = state.players.filter((p) => p.connected && !p.answered).map((p) => p.name);
    $("answer-status").textContent = answered
      ? `You answered "${state.myAnswer}". Waiting for: ${waiting.join(", ")}`
      : "";
  } else {
    $("answer-status").textContent = "Answers are in! Check the list below.";
  }

  // Rule Keeper controls
  const pending = state.guesses.filter((g) => g.status === "pending");
  show("reveal-btn", you.isKeeper && answering && answered);
  show("next-turn-btn", you.isKeeper && state.phase === "reveal");
  $("next-turn-btn").disabled = you.isKeeper && pending.length > 0;
  $("next-turn-btn").textContent =
    state.turn >= state.turnsPerRound ? "End round" : "Next prompt";
  show("next-turn-note", you.isKeeper && state.phase === "reveal" && pending.length > 0);

  // Guess box (guessers only)
  show("guess-area", !you.isKeeper);
  $("guess-btn").disabled = !state.canGuess;
  $("guess-input").disabled = !state.canGuess;
  $("guess-input").placeholder = state.canGuess
    ? "e.g. Words that start with S"
    : "You can guess again on the next prompt";

  // Judging (Rule Keeper only)
  show("judge-area", you.isKeeper && pending.length > 0);
  $("judge-list").innerHTML = pending
    .map(
      (g) => `<li>
        <span><b>${escapeHtml(g.name)}:</b> "${escapeHtml(g.text)}"</span>
        <span class="judge-buttons">
          <button class="btn small yes-btn" data-id="${g.id}" data-correct="yes">✓ Correct</button>
          <button class="btn small no-btn" data-id="${g.id}" data-correct="no">✗ Wrong</button>
        </span>
      </li>`
    )
    .join("");

  // Answers so far (newest prompt first)
  if (state.history.length === 0) {
    $("history").innerHTML = '<p class="muted">Answers will show up here after everyone submits.</p>';
  } else {
    $("history").innerHTML = [...state.history]
      .reverse()
      .map(
        (turn) => `<div class="turn">
          <p class="turn-title">${turn.turn}. ${escapeHtml(turn.prompt)}</p>
          <ul class="answers">
            ${turn.entries
              .map(
                (e) => `<li class="${e.follows ? "yes" : "no"}">
                  <span class="mark">${e.follows ? "✓" : "✗"}</span>
                  <span class="answer">${escapeHtml(e.answer)}</span>
                  <span class="who">${escapeHtml(e.name)}${e.isKeeper ? " (Rule Keeper)" : ""}</span>
                </li>`
              )
              .join("")}
          </ul>
        </div>`
      )
      .join("");
  }

  // Sidebar
  $("scoreboard").innerHTML = scoreListHtml();
  $("guess-feed").innerHTML =
    [...state.guesses]
      .reverse()
      .map((g) => {
        const label = { pending: "waiting…", wrong: "✗ wrong", correct: "✓ correct!" }[g.status];
        return `<li class="${g.status}"><b>${escapeHtml(g.name)}:</b> "${escapeHtml(g.text)}" <em>${label}</em></li>`;
      })
      .join("") || '<li class="muted">No guesses yet.</li>';
}

function drawRoundOver() {
  showScreen("round");
  const r = state.roundResult;
  $("round-title").textContent = `Round ${state.roundNumber} of ${state.totalRounds} is over`;
  $("round-rule").textContent = r.ruleText;

  if (r.reason === "cracked") {
    $("round-result").innerHTML = `🎉 <b>${escapeHtml(r.winnerName)}</b> cracked it! +${state.points.crack} points`;
  } else if (r.reason === "survived") {
    $("round-result").innerHTML = `🔒 Nobody cracked it. <b>${escapeHtml(r.keeperName)}</b> gets +${state.points.survive} points`;
  } else {
    $("round-result").textContent = "The Rule Keeper left the game, so this round ends early.";
  }

  $("round-scores").innerHTML = scoreListHtml();
  const lastRound = state.roundNumber >= state.totalRounds;
  $("next-round-btn").textContent = lastRound ? "See final scores" : "Next round";
  show("next-round-btn", state.you.isHost);
  $("round-wait").textContent = state.you.isHost ? "" : "Waiting for the host to continue...";
}

function drawGameOver() {
  showScreen("over");
  const players = sortedPlayers();
  const top = players[0] ? players[0].score : 0;
  const winners = players.filter((p) => p.score === top).map((p) => p.name);
  $("winner-text").textContent =
    winners.length > 1 ? `It's a tie between ${winners.join(" and ")}!` : `${winners[0]} wins!`;

  $("final-scores").innerHTML = players
    .map((p) => `<li><span>${escapeHtml(p.name)}</span><b>${p.score}</b></li>`)
    .join("");
  show("again-btn", state.you.isHost);
  $("over-wait").textContent = state.you.isHost ? "" : "Waiting for the host...";
}

// ---------------- Listen to the server ----------------

socket.on("state", (newState) => {
  state = newState;
  if (state.phase === "lobby") drawLobby();
  else if (state.phase === "answering" || state.phase === "reveal") drawGame();
  else if (state.phase === "roundOver") drawRoundOver();
  else if (state.phase === "gameOver") drawGameOver();
});

// If the connection drops (e.g. phone went to sleep), rejoin automatically
socket.on("connect", () => {
  if (state) {
    socket.emit("joinRoom", { name: state.you.name, code: state.code }, () => {});
  }
});
