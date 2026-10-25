# docs/

| File                                           | What                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| [milestones/](milestones)                      | Viva notes per milestone (M0–M7): what was built, decisions, results   |
| [architecture.mmd](architecture.mmd)           | Architecture diagram source (Mermaid); `architecture.png` is generated |
| [demo.gif](demo.gif)                           | README demo, generated from the live site                              |
| [report-outline.md](report-outline.md)         | Project report outline with where each section's material is           |
| [slides.md](slides.md)                         | 14-slide outline                                                       |
| [demo-script.md](demo-script.md)               | 3-minute live demo, minute by minute                                   |
| [viva-qa.md](viva-qa.md)                       | Likely examiner questions with short answers                           |
| [definition-of-done.md](definition-of-done.md) | The brief's checklist, item by item, with evidence                     |
| [sus/](sus)                                    | Usability study kit: tasks, questionnaire (en/hi), scoring script      |

## Regenerating the pictures

Architecture PNG (uses the installed Google Chrome, nothing else is downloaded for the browser):

```bash
echo '{"executablePath":"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}' > /tmp/pptr.json
PUPPETEER_SKIP_DOWNLOAD=true pnpm dlx @mermaid-js/mermaid-cli@11.17.0 -i docs/architecture.mmd -o docs/architecture.png -p /tmp/pptr.json -b white -s 2 -w 1400
```

Demo GIF (screenshots of the live site at phone size, then stitched with captions):

```bash
cd web && pnpm exec tsx scripts/demo-screens.ts https://dawacheck-psi.vercel.app /tmp/screens && cd ..
uv run --with pillow python eval/make_demo_gif.py /tmp/screens docs/demo.gif
```
