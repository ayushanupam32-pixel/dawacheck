# Usability study (SUS)

The brief asks for a System Usability Scale (SUS) score of at least 70 from 15–20 real users.
SUS is the standard 10-question usability questionnaire (Brooke, 1996); scores run from 0 to
100, and 68 is the average across thousands of studies (Sauro, 2011).

## Before you start

- 15–20 people, ideally a mix: family members who buy medicines, older adults, someone who prefers
  Hindi. Not classmates only.
- About 10 minutes each. Use the live site on **their own phone** if possible.
- Say this first (consent): "This is a student project. I'm testing the app, not you. I won't
  record your name or anything personal. You can stop at any time." Don't collect names, phone
  numbers or photos of people.
- Have one real medicine strip ready (any common one), for task 5.

## Tasks (read each one out; don't help unless they are stuck for a minute)

1. "Open dawacheck-psi.vercel.app. Try the blood-pressure demo strip and find out how much you
   would save at Jan Aushadhi."
2. "Try the other demo strip. Is there anything wrong with that batch? What would you do?"
   (Right answer: show it to the pharmacist.)
3. "Search by typing the name of a medicine you or your family take."
4. "Find the nearest Jan Aushadhi Kendra to your home, using your PIN code."
5. "Take photos of this strip and check it." (Optional; note if the reading worked.)

Write down for each task: done / done with help / not done, and anything they said
(`notes.md`, no names). Then give them the questionnaire.

## Questionnaire

`questionnaire.md` has the 10 statements in English and Hindi. Each is answered 1 (strongly
disagree) to 5 (strongly agree). Don't change the wording or order: SUS is only comparable
when used as is.

## Recording and scoring

Copy `responses-template.csv` to `responses.csv`, one row per person (P01, P02, …), the 10
answers as numbers 1–5. Then:

```bash
python3 docs/sus/sus_score.py docs/sus/responses.csv
```

It prints each person's score, the mean, the standard deviation, a 95% confidence interval and
the share of people at or above 68. Put the mean (with the interval and the number of people) in
the report and on the slides.

The Hindi version is our own translation and has not been validated; say so in the report.
