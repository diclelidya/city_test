# Round 16 brief: you can't stray the same way twice

## Why

The app is deterministic: the same A, B, day and hour always give the same misrouted walk. A line of flight drawn the same way every time becomes a new code of the city; the README already says "Straying that repeats becomes a routine." Richardson's schizocartography is subjective and plural: people challenge conventional routes, they don't swap one for another.

The new framing: the app is not only the map but the start of a walk. The misrouted walk is meant to be walked by the visitor, in the street, with their own body. The app chooses the deviation (against the city's reading of you, not by chance); the visitor walks it.

So the misrouted walk keeps its purpose and its logic, but a visitor who takes a walk between two points gets a different one the next time.

## What changes

1. **Words: the walk is meant to be walked.**
   - Manifesto line 4 becomes: "This app shows the walk expected of you, then hands you the one you would least take, hour by hour." (Panel and README.)
   - "How it works" and the README say that the walk is meant to be walked by the visitor, and can be followed from the map or a screenshot.
   - README limit "The misrouted walk is also chosen by the app, not by the walker" is rewritten: the app chooses the walk; the visitor walks it.

2. **"Take this walk".** A small button on the panel says "Take this walk". It saves, in this browser only, the streets of the misrouted walk currently shown, under this A and B.
   - Nothing else counts as taken: not the hour slider, not Play the day, not reloading the page.
   - Not available on the example walk, and when the misrouted walk is the same as the shortest route or there is no new walk.
   - After pressing, the walk on screen stays (you may be about to walk it); the button shows it is taken. Every later computation for this A and B uses the memory.

3. **You can't stray the same way twice.** For an A and B with taken walks, every misrouted walk between them, at every hour and on both days, avoids the streets of the taken walks.
   - Same rule as "Remember earlier hours", carried across visits: a street costs once more for each taken walk that used it. No randomness: two people who took the same walks see the same next walk, so it stays explainable and testable (no seed needed).
   - All other rules hold: streets far from the sharpened profile, leaving the shortest and expected route where it can, within twice the shortest route.
   - A and B are the snapped street nodes, in this direction (A to B is not B to A).
   - It applies everywhere: the walk shown when A and B are set, the hour slider, Play the day, and together with "Remember earlier hours". The day's summary says how many taken walks it avoided, for example "after 2 walks you took here".

4. **First walk and the honest number.**
   - The first walk for an A and B is the farthest one, the same as today, and the same for everyone.
   - Later walks are different and usually a little closer to the profile. The panel shows their own distance from yourself, and next to it the first walk's number at the same hour, for example "walk 2 here · 44 % (first walk 48 %)".
   - "How it works" says: each time you stray from the same place, you can stray a little less far.

5. **When no new walk fits.** A new walk does not count as new if it shares 80 % or more of its length with any taken walk (the same rule as "one way" in Play the day), or if the memory would have to be dropped to stay within twice the shortest route. Then:
   - No blue line. The map shows only the shortest and the expected route.
   - The panel says: "No new way to stray between these points within twice the shortest route. Forget my walks to start again."
   - In Play the day, such hours leave no footsteps and the summary names them.

6. **Forget my walks.** A small "Forget my walks" link on the panel clears all taken walks in this browser. A short note next to it says that taken walks are kept only in this browser and never sent anywhere.

## What stays

- The example walk at opening is always the same, for everyone, and never reads the memory.
- With no taken walks, every route and number is exactly as now: the 200-walk checksum stays `bfe3403f7862c235`.
- Nothing about a walk or a walker reaches Dicle or any server. No notes, photos, tracks or feedback after the walk.
- Taken walks live only in localStorage (wrapped in try/catch), as street indices per A and B, no personal data, clearable from the page. If storage is blocked, they last until the page is closed.
- No phone layout, no export to Google Maps or other platforms, no QR code. Minimum width stays 800 px.
- The dark city; electric blue only for the misrouted walk (the new button and link are grey, not blue).
- `CLAUDE.md` rules. Data loads through `import.meta.env.BASE_URL`.
- README "How this was made": lines 1, 2 and 4 stay as they are; line 3 gets one sentence about this round at its end.

## How we'll check

1. **200-walk test**, before and after, with no taken walks: checksum `bfe3403f7862c235` and every figure identical.
2. **New test, reported separately:** on random walks at least 500 m long, take walks one after another until no new walk fits. Report how many walks an A and B gives on average, and how the distance from yourself drops from the first to later walks.
3. **`npm run build`** passes.
4. **On localhost**, no console errors:
   - The example walk has no "Take this walk" and does not change after walks are taken elsewhere.
   - Set A and B, take the walk, set the same A and B again: a different walk, with its own number and the first walk's number.
   - Change the hour and play the day: the taken streets are avoided; the summary mentions the taken walks.
   - Repeat until no new walk fits: no blue line, the note shows.
   - Reload: taken walks are still there. "Forget my walks": the first walk returns.

## Report at the end

Files changed, the 200-walk test before and after, the new test separately, and what to check on the page.
