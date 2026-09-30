# Fake Rule

A multiplayer party game. One player knows a secret rule, and everyone else tries to figure it out from which answers get a ✓ and which get a ✗.

## How to run it on your Mac

1. **Install Node.js** from https://nodejs.org (pick the "LTS" version).
2. **Open Terminal**, then go into this folder. The easiest way: type `cd ` (with a space), drag the `fake-rule` folder into the Terminal window, and press Enter.
3. **Install the game's libraries** (only needed the first time):
   ```
   npm install
   ```
4. **Start the game:**
   ```
   npm start
   ```
5. Open **http://localhost:3000** in your browser.

To stop the server, click the Terminal window and press `Ctrl + C`.

## Playing with friends

- **Same Wi-Fi:** find your Mac's local address (System Settings → Wi-Fi → Details → IP address, something like `192.168.1.25`). Friends open `http://192.168.1.25:3000` on their phones or laptops.
- **Over the internet:** the game needs to be hosted online. Render.com has a free tier that works well for this.

You need at least 3 players. Testing by yourself? Open 3 browser windows (one can be a private window) and use a different name in each.

## What each file does

| File | What it does |
|---|---|
| `server.js` | The game's brain: rooms, turns, scores and who sees what |
| `rules.js` | The list of secret rules and prompts. **Easiest place to start editing!** |
| `public/index.html` | The layout of every screen |
| `public/client.js` | Runs in each player's browser, sends actions and draws the screens |
| `public/style.css` | Colors, fonts and layout |

## Easy things to try changing

- Add your own rules or prompts in `rules.js`.
- Change the points or number of prompts per round at the top of `server.js`.
- Change the colors at the top of `public/style.css`.

After changing a file, stop the server (`Ctrl + C`), run `npm start` again, and refresh your browser.
