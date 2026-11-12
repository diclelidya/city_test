# Round 15 brief: readable at a glance

## Why

The page is opened by a jury, sometimes with Dicle beside them, sometimes alone. It is designed for the jury member alone: if it works without Dicle, it works with her.

In the first ten seconds they should get: **"The aim is not a better route: it is to make the city's quiet routing visible, and to measure how far you can stray from it."**

They should feel, in this order: first that the city reads them, then that straying is possible and costs only a few minutes. Not an accusation, a quiet invitation.

## What changes

1. **Introduction.** Dicle's own text replaces the current introduction, with "This mode" changed to "This app":
   > In Weimar I noticed that each of us (student, visitor, local, commuter) moves from A to B along the routes our profile is given, so we rarely discover the city by chance. This app reads who the city takes you for on a walk, shows the route it expects of you, then misroutes you along the streets you would least take, hour by hour.
   >
   > The aim is not a better route: it is to make the city's quiet routing visible, and to measure how far you can stray from it.

   The aim sentence gets its own paragraph, same size, in a lighter tone close to the heading colour. It is not blue, because blue stays only for the misrouted walk. Measured: the full text, the card and the example line end at 406 px, so nothing needs cutting at 1440×900 or 800×760.

2. **The page opens with an example walk.** The example runs on a weekday at 12:00, from the Bauhaus-Universität main building (A: lon 11.32935, lat 50.97445) to the street node about 90 m west of the Markt (B: x 253 m, y −314 m in the app's coordinates).
   - It was checked as typical. The city reads the walk as student 59 %. The expected route measures 38 % from yourself and the misrouted walk 48 %, a 10-point gap (the 200-walk median is 11). Straying costs +5 min, and the misrouted walk passes mainly residential · retail, not education.
   - Uni → Markt itself was rejected. There the expected route is the same as the shortest route, the cost is +2 min, and the misrouted walk passes mainly education.
   - The panel line, in place of the "snapped" status line while the example is shown: "Example: from the Bauhaus-Universität to near the Markt, weekday 12:00. Click the map to set your own A, then B."
   - Place names on the map, only for the example. "BAUHAUS-UNIVERSITÄT" goes next to A and "NEAR THE MARKT" next to B, small and faint. B's place name sits as a line above B's label, so it doesn't compete with it.
   - The first click removes the example and its place names, and sets A.
   - Once the example is gone, a faint "Show the example walk again" link appears under the status line. It brings back the example, its place names and weekday 12:00.
   - "How it works" and the README say in one or two sentences why this walk was chosen. The opening walk was chosen to be typical. Moving B about 90 m to the Markt itself changes the result: the expected route becomes the shortest. The city's reading of a walk is fragile, and a few steps can change it.

3. **The label at B** becomes two lines with no arrow, using only this walk's own numbers:
   - Top line: "5 MINUTES MORE".
   - Second line, smaller: "48 % FROM YOURSELF".
   - The comparison with the expected route stays in the panel card, where each number has its label.
   - Edge cases: "1 MINUTE MORE"; "UNDER A MINUTE MORE" when the minutes round to 0; "DOES NOT STRAY" stays as it is.

4. **Pins and labels against the panel, the legend and the screen edge.**
   - The panel and the legend are always drawn above the pins and labels. What falls under them is hidden, as labels behind the attribution line are now.
   - A label that would run off the right edge of the screen moves to the other side of its point.
   - When the camera frames the walk (at opening, and after A and B are set), it fits the walk into the visible area right of the panel and below the legend. A, B and B's label start fully visible.
   - If the visitor pans something under the panel, hiding it is fine.
   - Minimum width is 800 px. Phones are out of scope.

## What stays

- The routing, the profile, the affinities, the rhythm, the memory and every number. Nothing in the logic changes, so the 200-walk checksum must stay the same.
- The panel card (misrouted %, expected %, extra minutes), the profile bars, the three routes, Play the day, Remember earlier hours, Show how the city reads you, and the legend.
- The other route labels: "MISROUTED WALK" with its uses, "EXPECTED ROUTE", "LEAVES THE EXPECTED WAY" and "REJOINS".
- The dark city, and electric blue only for straying.
- `CLAUDE.md` rules. Data loads through `import.meta.env.BASE_URL`.
- README "How this was made": lines 1, 2 and 4 stay as they are. Line 3 gets one sentence about this round at its end.

## How we'll check

1. **200-walk test**, before and after: `walktest.mjs` on the worktree. The checksum and every figure must be identical.
2. **`npm run build`** passes.
3. **On localhost**, with no console errors.
   - Screenshots at 1440×900 and 800×760.
   - Without scrolling, the first screen shows: the aim sentence, the example line, the card, and on the map A, B, B's two-line label and the two place names.
   - No pin or label draws over the panel or the legend, and none is cut off at the right edge.
4. **Flow.**
   - The first click removes the example and its place names and sets A. The second click sets B.
   - "Show the example walk again" restores the example at weekday 12:00.
   - The B label edge cases are checked on walks that cost 1 min, round to 0 min, or do not stray.

## Report at the end

Files changed, the 200-walk test before and after, and what to check on the page.

