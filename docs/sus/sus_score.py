"""Score a System Usability Scale (SUS) study.

Usage: python3 docs/sus/sus_score.py docs/sus/responses.csv

SUS scoring (Brooke, 1996): each answer is 1-5. Odd statements are positive, so they count
(answer - 1); even statements are negative, so they count (5 - answer). The ten counts (0-4
each) are summed and multiplied by 2.5, giving 0-100. 68 is the average across published
studies (Sauro, 2011). Rows with a missing or out-of-range answer are skipped and reported.
Standard library only.
"""

import csv
import math
import statistics
import sys


def sus_score(answers: list[int]) -> float:
    """Ten answers (1-5) -> SUS score (0-100).

    >>> sus_score([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])
    100.0
    >>> sus_score([3] * 10)
    50.0
    >>> sus_score([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])
    0.0
    """
    if len(answers) != 10 or any(a not in (1, 2, 3, 4, 5) for a in answers):
        raise ValueError(f"need 10 answers from 1 to 5, got {answers}")
    total = sum((a - 1) if i % 2 == 0 else (5 - a) for i, a in enumerate(answers))
    return total * 2.5


def summary(scores: list[float]) -> dict:
    """Mean, standard deviation and a 95% confidence interval (t distribution).

    >>> summary([70.0, 80.0, 90.0])["mean"]
    80.0
    """
    n = len(scores)
    mean = statistics.fmean(scores)
    sd = statistics.stdev(scores) if n > 1 else 0.0
    # Two-sided 95% t values for small samples (df = n - 1); 1.96 beyond 30.
    t = {
        1: 12.71,
        2: 4.30,
        3: 3.18,
        4: 2.78,
        5: 2.57,
        6: 2.45,
        7: 2.36,
        8: 2.31,
        9: 2.26,
        10: 2.23,
        11: 2.20,
        12: 2.18,
        13: 2.16,
        14: 2.14,
        15: 2.13,
        16: 2.12,
        17: 2.11,
        18: 2.10,
        19: 2.09,
        20: 2.09,
        25: 2.06,
        30: 2.04,
    }
    df = n - 1
    tv = t.get(df) or (1.96 if df > 30 else t[min(k for k in t if k >= df)])
    half = tv * sd / math.sqrt(n) if n > 1 else float("nan")
    # A SUS score cannot leave 0-100, so neither can the interval (it would with very few people).
    ci = (max(0.0, mean - half), min(100.0, mean + half))
    return {
        "n": n,
        "mean": mean,
        "sd": sd,
        "ci": ci,
        "at_least_68": sum(s >= 68 for s in scores) / n,
    }


def main(path: str) -> None:
    scores = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                answers = [int(row[f"q{i}"]) for i in range(1, 11)]
                score = sus_score(answers)
            except (ValueError, KeyError) as e:
                print(f"skipped {row.get('participant', '?')}: {e}")
                continue
            scores.append(score)
            print(f"{row['participant']}: {score:.1f}")
    if not scores:
        print("No complete responses.")
        return
    s = summary(scores)
    low, high = s["ci"]
    print(f"\nParticipants: {s['n']}")
    print(f"SUS mean: {s['mean']:.1f} (SD {s['sd']:.1f}; 95% CI {low:.1f}–{high:.1f})")
    print(f"At or above the average of 68: {s['at_least_68']:.0%}")
    print(f"Brief's target (mean ≥ 70): {'met' if s['mean'] >= 70 else 'not met'}")


if __name__ == "__main__":
    main(sys.argv[1])
