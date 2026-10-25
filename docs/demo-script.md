# 3-minute demo script

Use **Demo mode**, not a real strip: it never depends on the light in the room. Open
https://dawacheck-psi.vercel.app/en on a phone (mirrored to the projector) or a laptop in a
narrow window. Before the viva: open the site once so the OCR model is cached, and check the
Wi-Fi. Plan B: `docs/demo.gif` on a slide.

The brief's script had a "family cabinet duplicate warning" step; that milestone (M6) was dropped,
so its 20 seconds go to showing that DawaCheck says "not sure" instead of guessing.

| Time      | Do                                                                                                                                             | Say                                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:15 | Home page. Point at the five checks and the language switch.                                                                                   | "DawaCheck checks a medicine strip against public government data: cheaper generic, quality alerts, fair price, banned combinations, nearest Jan Aushadhi Kendra. In English, Hindi and Tamil."               |
| 0:15–0:45 | Scan → **Demo: blood-pressure strip**. While it reads, point at "Reading…".                                                                    | "These are two sample photos with a tilt, a shadow and glare. The phone reads them itself with Tesseract; the photos never leave the phone."                                                                  |
| 0:45–1:05 | Confirm screen: point at the filled fields; open "How we read this".                                                                           | "It read the name, ingredients, MRP, batch and dates. Anything it's unsure of is marked 'Please check'. Here it shows which image version each field came from and how long it took."                         |
| 1:05–1:35 | **Find a cheaper generic** → "Telmikind 40 Tablet, 81%"; scroll the checks; then the saving.                                                   | "It matched the strip to Telmikind 40 and says how sure it is. Jan Aushadhi sells exactly the same composition: about ₹26 less per strip. Batch not in any alert; price within the NPPA ceiling; not banned." |
| 1:35–2:10 | Back → Scan → **Demo: strip with a quality alert**. Type **Omee** as the name, tick **It matches my strip**, Find.                             | "This strip carries a batch number from a real CDSCO alert of September 2026. The reader couldn't read this short brand name, so I type it — the app never guesses a name it couldn't read."                  |
| 2:10–2:25 | Point at the red **Batch safety: Alert**.                                                                                                      | "Same batch, same product: the alert applies. It tells you to show this to your pharmacist — never to stop the medicine."                                                                                     |
| 2:25–2:40 | On the confirm screen, change the name to **Valium** and clear the ingredients, Find → "not sure", three options. (Optional if time is short.) | "Valium comes in 2, 5 and 10 mg. Without the strength it doesn't guess: it asks. Abstaining took wrong answers from 26% to 3% in our tests."                                                                  |
| 2:40–2:52 | Kendras → PIN **110001** → Find → three Kendras with distance, Call and Directions.                                                            | "The nearest Kendras are worked out on the phone; your location isn't sent."                                                                                                                                  |
| 2:52–3:00 | About page → results table.                                                                                                                    | "Every data source with its last refresh date, and our evaluation results with baselines. All of it runs at zero cost."                                                                                       |

If something fails live: say what it shows ("this is the abstention working" / "the network is
slow"), switch to the GIF, and carry on. Never fake a result.
