# Chromatic Cacti

A cozy 3D cactus garden in your browser. Grow strange, colorful cacti, mutate and collect them, then defend the garden from pests like snails, earwigs and magpies.

## How to play

- Pick a seed in the nursery, then tap an empty plot to plant it. Tap a plant to water, feed, mutate, sell or inspect it.
- Fill orders, buy upgrades and expand the garden. The Collection panel tracks every form you've grown.
- Start a wave in the defense panel to raid-test the garden. **Stomp** hits broadly; **Spray** is smaller but reaches flying magpies.
- Controls: drag to orbit the camera, scroll to zoom, **1** / **2** pick a weapon, **R** reloads. On phones, everything works by touch.
- It autosaves in your browser. Sound is off until you turn it on. A WebGL-capable browser is needed.

## Hosting it

Build the single-file game first (needs Node 20+):

```
npm install
npm run build        # writes dist/index.html
```

`dist/index.html` is fully self-contained (HTML, CSS, JS and Three.js inlined), so you can:

- **Open it directly** in a browser, email it, or put it on any static host.
- **Share over Tailscale:** `npm run share` builds and serves it on `0.0.0.0:5173` and prints the URLs. Friends on your tailnet open `http://<your-tailscale-ip>:5173`. Set `PORT=…` to change the port.
- **Share with a playit.gg tunnel:** run `npm run share`, then create a TCP/HTTP tunnel in playit.gg pointing at local port 5173 and send over the address it gives you.
- **GitHub Pages (optional):** in the repo settings set Pages → Source to "GitHub Actions", then run the *Deploy to GitHub Pages* workflow from the Actions tab. It tests, builds and publishes `dist/`.

## Development

```
git clone https://github.com/Soul4723/chromatic-cacti.git
cd chromatic-cacti
npm install
npm start            # dev server at http://127.0.0.1:5173 (set HOST to expose it)
npm test             # simulation, progression, combat and save checks
```

Three.js is bundled locally; no external assets or network services are used. Credits for third-party material are in `THIRD_PARTY_NOTICES.md`.

## License

MIT, see [LICENSE](LICENSE).
