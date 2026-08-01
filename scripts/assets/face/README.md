# Face photo

Drop one photo of your face in this folder — `face.jpg`, `face.png` or `face.webp`.
`03-create-character.ts` picks the first image it finds here, or you can point at
another file with `--image /path/to/photo.jpg`.

What works best as a Viggle Character source:

- a single person, full head visible, facing the camera
- even lighting, no heavy shadow across the face
- PNG, JPEG or WebP (the only formats `POST /v1/characters` accepts)
- a full-body shot generally tracks better than a head-and-shoulders crop

Everything in this folder is gitignored except this README and `.gitkeep`, so your
photo never gets committed. The `char_` id Viggle returns is cached alongside it in
`.character.json`, keyed by the file's SHA-256 — change the photo and a new
Character is created, keep it and every later run reuses the same one for free.
