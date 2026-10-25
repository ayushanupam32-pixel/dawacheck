# Demo strips: verified on the website

Checked 2026-10-25 on https://dawacheck-psi.vercel.app by `web/scripts/verify-demo-strips.ts`:
front, back and stamp chosen from the gallery, then "Find a cheaper generic", like a user,
after one warm-up read with the in-app demo button (as `README.md` says to do before a demo).

| Strip                         | Name read         | Matched to             | Generic       | Batch         | Fair price                                 | Banned               | Read in | Tries | OK  |
| ----------------------------- | ----------------- | ---------------------- | ------------- | ------------- | ------------------------------------------ | -------------------- | ------- | ----- | --- |
| 1-everyday/01-telmikind-40    | TELMIKIND 40      | Telmikind 40 Tablet    | Available     | Nothing found | within                                     | Nothing found        | 0.7 s   | 1     | yes |
| 1-everyday/02-dolo-650        | DOLO 650          | Dolo 650 Tablet        | Available     | Nothing found | within                                     | Nothing found        | 0.6 s   | 1     | yes |
| 1-everyday/03-amlokind-5      | AMLOKIND 5        | Amlokind 5 Tablet      | Available     | Nothing found | within                                     | Nothing found        | 0.7 s   | 1     | yes |
| 1-everyday/04-pantop-40       | PANTOP 40         | Pantop 40 Tablet       | Available     | Nothing found | no ceiling                                 | Nothing found        | 0.7 s   | 1     | yes |
| 1-everyday/05-glycomet-500-sr | GLYCOMET 500 SR   | Glycomet 500 SR Tablet | Available     | Nothing found | no ceiling                                 | Nothing found        | 0.6 s   | 1     | yes |
| 1-everyday/06-losar-50        | LOSAR 50          | Losar 50 Tablet        | Available     | Nothing found | no ceiling                                 | Nothing found        | 0.6 s   | 1     | yes |
| 1-everyday/07-thyronorm-50    | THYRONORM 50      | Thyronorm 50mcg Tablet | Available     | Nothing found | within                                     | Nothing found        | 0.6 s   | 1     | yes |
| 1-everyday/08-azee-500        | \| AZEE 500       | Azee 500 Tablet        | Available     | Nothing found | within                                     | Nothing found        | 0.7 s   | 1     | yes |
| 1-everyday/09-allegra-120     | ALLEGRA 120       | Allegra 120mg Tablet   | Available     | Nothing found | no ceiling                                 | Nothing found        | 0.6 s   | 1     | yes |
| 1-everyday/10-concor-5        | CONCOR 5          | Concor 5 Tablet        | Available     | Nothing found | no ceiling                                 | Nothing found        | 0.6 s   | 1     | yes |
| 2-expensive/01-montair-10     | MONTAIR 10        | Montair 10 Tablet      | Available     | Nothing found | above                                      | Nothing found        | 0.7 s   | 1     | yes |
| 2-expensive/02-storvas-10     | STORVAS 10        | Storvas 10 Tablet      | Available     | Nothing found | above                                      | Nothing found        | 0.7 s   | 1     | yes |
| 2-expensive/03-rosuvas-10     | ROSUVAS 10        | Rosuvas 10 Tablet      | Available     | Nothing found | no ceiling                                 | Nothing found        | 0.7 s   | 1     | yes |
| 2-expensive/04-galvus-50      | \| GALVUS 50      | Galvus 50mg Tablet     | Available     | Nothing found | no ceiling                                 | Nothing found        | 0.6 s   | 1     | yes |
| 3-batch-alert/01-omee         | OMEE · tick batch | Omee Capsule           | Available     | Alert         | within                                     | Nothing found        | 1.4 s   | 1     | yes |
| 3-batch-alert/02-taxim-o-200  | TAXIM-O 200       | Taxim-O 200 Tablet     | Available     | Alert         | above                                      | Nothing found        | 0.6 s   | 1     | yes |
| 4-banned/01-enselin-2         | ENSELIN 2         | Enselin 2mg Tablet     | Not available | Nothing found | no ceiling                                 | Alert                | 0.6 s   | 1     | yes |
| 4-banned/02-cefolac-az        | CEFOLAC-AZ        | Cefolac-AZ Tablet      | Not available | Nothing found | couldn't check (ingredients not confirmed) | Show your pharmacist | 0.7 s   | 1     | yes |
