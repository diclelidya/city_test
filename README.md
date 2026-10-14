# How far can you walk? Weimar

A 3D web app of central Weimar that shows how far you can walk in 5, 10 and 15 minutes from any point, and about how many people live there.

## What it does

- Shows the whole city kit in 3D. Buildings rise from their footprints to their measured height and are coloured by their main use, with a legend. The street network is drawn as thin lines on a pale ground.
- Drag to orbit, right-drag to pan, and scroll to zoom.
- Click on the ground (or on a building) to start a walk from the nearest street node. The app draws three nested areas for 5, 10 and 15 minutes in three shades of violet, and colours every building that touches an area in the matching shade.
- A panel lists the number of buildings reached and about how many residents live in each area.
- Below it, a list of the buildings with shop space within 5 minutes, largest retail area first, each with an orange pin on the map. Hover or click a row to find its pin; click a pin to find its row.
- A switch at the top of the panel changes to a second mode, "Walk from yourself" (below), with its own bands, building colours and a "Play the day" animation. The walking reach stays as it was.

## Run it

You need [Node.js](https://nodejs.org) installed. In this folder:

```
npm install     install the packages (once)
npm run dev     start the app at http://localhost:5173
```

`npm run build` makes the published version in `dist/`. GitHub Pages publishes it at `https://<user>.github.io/<repo>/` on every push to `main`, through the workflow in `.github/workflows/`.

## Method and limits

- **Walking speed:** 4.8 km/h, which is 80 m per minute, so 400 m, 800 m and 1,200 m for 5, 10 and 15 minutes. The walk starts at the walkable node of the pedestrian network nearest to your click and follows the network's walkable edges, measured by their `length` in metres. If no node lies within 100 m of the click, the app says so instead. The short way from the click to that node is not counted.
- **The 25 m band:** each area is the street segments reached in that time, including the reachable part of the last segment, with a band of 25 m on each side, joined into one shape. It is not a circle and not a convex hull. A building counts as reached if its footprint touches the area. The counts for 10 and 15 minutes include the buildings of the shorter walks.
- **How residents are counted:** from the 100 m cells of the Zensus 2022. For every cell that overlaps the area, the app takes the cell's population times the share of the cell's area that lies inside the area, adds these up and rounds to the nearest 10. This assumes people are spread evenly within each cell, which they are not: a cell's residents live in its buildings, not on its streets. The census also changes small counts slightly at random to protect privacy, so the result is an estimate.
- **Cells without a figure:** some cells have no published resident count (`population` is `null`). They are not zero. They are left out of the sum, and the panel shows how many such cells overlap each area.
- **Shops:** the data has no individual shops, names or addresses, only an estimated floor area per use for each building. The shop list shows every building with some `retail` floor area that the 5-minute area touches, so one entry can hold several shops, or a single shop under flats. Its walking time is measured along the network to the nearest point of the street closest to the building (when several streets are within 10 m of that, the shortest walk counts), so it can be a little over 5 minutes for a building the band just reaches.
- Every street in the network can be walked both ways. Slopes, steps, traffic lights and waiting times are not included.

## Second mode: How far can you walk from yourself?

The walking reach asks how far you can walk. This mode asks how far you can walk from yourself: from the walk the city expects of you. A city that sorts people by where they come from and where they go would read a walk as a type of person and route them accordingly. The mode shows that reading, then misroutes the walker along a way their profile would never take, and measures how far that is from the profile.

**How to use it.** Choose "Walk from yourself" in the switch. The first click sets the start (A), the second the destination (B), a third click starts over. Both snap to the nearest walkable street node, as in the walking reach, within 100 m. Below the status line, choose weekday or weekend and the hour of the walk (it starts at weekday 12:00); changing either reads the same walk again.

**The profile.** The app guesses a mix of five profiles, as shares that add up to 100 %: visitor, student, local resident, older resident and commuter (someone who comes into the city to work).

- From A, where someone lives or stays. The app takes the floor area per use of the buildings within 100 m of A, as shares, and the census cell of A. Every profile starts with the same 0.2 points, then:
  - local resident: + 2 × the residential share;
  - older resident: + 2 × the residential share × how far the average age of the cell is above 38 years (full at 53), + the health share;
  - student: + 3 × the education share, + up to 1 for an average age below 38 years (full at 26), + 0.5 for rent below 6.60 € per m²;
  - visitor: + 3 × the share of accommodation, culture and entertainment;
  - commuter: + 3 × the share of transport and office, + 0.3 if A lies within 150 m of the edge of the kit.
  Census fields without a figure (`null`) are skipped. The points are then scaled to add up to 100 %.
- B moves the mix in proportion to how telling the destination is. Each use near B pulls towards one profile: education towards students (strength 0.6), accommodation and culture towards visitors (0.5), office towards commuters (0.4), health towards older residents (0.25), residential towards local residents (0.2). Retail and food (0.05) pull towards no one, because everyone goes there. A destination that is all education, for example, gives 60 % student plus 40 % of the mix from A.
- The time of the walk then tilts the mix. Each rule that applies multiplies some shares, then all shares are scaled back to 100 %. The rules can add up: weekend at 23:00 applies both "weekend, all day" and "late night".

  | When | Shift |
  | --- | --- |
  | weekday morning, 6–9 | students and commuters ×1.5 |
  | weekday office hours, 9–17 | commuters ×1.5, older residents ×1.25 |
  | weekday evening, 17–22 | visitors and students ×1.5 |
  | weekend daytime, 10–18 | visitors ×1.75 |
  | weekend evening, 18–22 | visitors and students ×1.5 |
  | weekend, all day | commuters ×0.5, because few people come in to work at the weekend |
  | late night, 22–6, any day | students ×2, older residents ×0.5 |

  Local residents are never shifted: they walk at every hour. Weekend mornings (6–10) have no rule of their own. The panel lists the rules that apply.
- The purpose of the trip is the purpose with the most floor area within 100 m of B: shopping (retail), work (office, service, civic, transport, light industrial), study (education), culture (culture, entertainment, accommodation), health or food. When more than half of the floor area near B is flats or of unknown use, the purpose is "home or a visit".

**Affinities.** Each profile has an affinity from 0 to 1 for each building use. The mix's affinity is the share-weighted average of the five.

| use | visitor | student | local | older | commuter |
| --- | --- | --- | --- | --- | --- |
| residential | 0.1 | 0.5 | 1.0 | 0.9 | 0.1 |
| service | 0.3 | 0.3 | 0.7 | 0.6 | 0.7 |
| education | 0.2 | 1.0 | 0.4 | 0.1 | 0.2 |
| civic | 0.5 | 0.3 | 0.6 | 0.6 | 0.5 |
| entertainment | 0.8 | 0.7 | 0.4 | 0.2 | 0.2 |
| retail | 0.7 | 0.5 | 0.8 | 0.7 | 0.4 |
| food and drink | 0.9 | 0.8 | 0.6 | 0.5 | 0.5 |
| office | 0.1 | 0.2 | 0.4 | 0.2 | 1.0 |
| health | 0.1 | 0.2 | 0.6 | 1.0 | 0.2 |
| accommodation | 1.0 | 0.2 | 0.1 | 0.1 | 0.2 |
| culture | 1.0 | 0.6 | 0.4 | 0.6 | 0.1 |
| sport | 0.3 | 0.7 | 0.5 | 0.2 | 0.1 |
| transport | 0.7 | 0.5 | 0.3 | 0.4 | 1.0 |
| light industrial | 0.0 | 0.1 | 0.2 | 0.1 | 0.5 |

**The three routes**, from A to B along the pedestrian network:

1. The shortest route, a dashed near-black line drawn on top of the other two, so it stays visible where they share streets.
2. The expected route, drawn as a solid blue line along the street centre, on top of a translucent blue band, 25 m on each side, like the reach areas. Each street gets the floor-area-weighted affinity of the buildings within 25 m of it. These scores sit close together, so the streets are ranked from 0 (least suited to the mix) to 1 (most suited). A street then costs its length × (1 + 3 × (1 − rank)), and the route is the cheapest one.
3. The misrouted walk, drawn as a solid pink line along the street centre, on top of a translucent pink band, 25 m on each side. Where the two bands overlap, the colours mix. The dashed near-black shortest route lies on top of everything. A street costs its length × (1 + 3 × rank), so streets the profile is least drawn to are cheap. On top of that, the streets of the shortest route and of the expected route cost twice as much, so the misrouted walk leaves both where it can. Without this, the shortest route often already passed the least-suited streets, and the walker was never misrouted. If that route is more than twice as long as the shortest route, the app tries 2, 1 and 0.5 instead of 3. If none fits, the misrouted walk is the shortest route, and the panel says so. When all three routes are the same, the panel suggests walking further: "Walk further to stray: try two points at least 500 m apart."

**Distance from yourself.** For the shortest route, the buildings within 25 m of the whole route are weighted by their floor area. The distance is 1 minus their average affinity for the mix, as a percentage. For the expected route and the misrouted walk, only the streets that are not on the shortest route are measured, so the stretches all routes share at the start and end don't flatten the numbers. A building within 25 m of one of those streets counts, even if it is also near the shortest route, because the walker passes it there. A route that is the same as the shortest route has nothing of its own to measure, and the panel says "same as the shortest route". The panel also shows each route's length, its minutes at 80 m per minute, how many metres of it are measured, and the three uses with the most floor area along the measured part.

**The buildings.** While a walk is shown, the buildings within 25 m of the expected route turn blue, those within 25 m of the misrouted walk pink, and those near both a mix of the two (purple). All other buildings fade to a pale grey, including those near only the shortest route. The legend changes to match. The walking reach keeps its own colours.

**Play the day.** The "Play the day" button computes the walk for every hour from 0 to 23 on the chosen weekday or weekend, all at once in the background, then plays one hour per second. The slider and the panel follow the hour, and the bands and buildings are redrawn each time. The misrouted walk of every hour played stays on the map as a dotted pink trace, so it can't be mistaken for the current, solid route. Hours whose misrouted walk uses exactly the same streets share one trace, and a trace gets thicker and less faint the more hours share it, so the way the walk strays most often stands out, and a way taken at only one hour stays thin and pale. Hours when the misrouted walk is the same as the shortest route leave no trace. Pointing at a trace shows its hours, for example "9–16", and the legend gains a row "Misrouted walks at other hours" once there are traces.

- The button turns into Pause while playing, and into Continue after pausing. Moving the hour slider by hand also pauses; the hour is then taken from the day already computed.
- At the end, the map returns to the hour set before playing, the traces stay, and the panel sums up the day, for example: "Across the weekday, this walk strays in 2 different ways: 0–8 and 17–23 (16 hours) · 9–16 (8 hours)." The ways are listed from the most to the fewest hours, and hours that do not stray are named.
- A new A, a new B, or switching between weekday and weekend clears the traces and the summary.

**Unknown use and empty streets.** Floor area of use `undefined` is left out of the profile, the street scores and the distance, so it counts as neither close nor far. The panel shows its share along each route. Streets with no buildings of known use within 25 m (paths through parks, squares) get the middle rank, 0.5.

**Limits.**

- The profile is a guess, not a fact about anyone. The weights, the destination pulls and the affinity table are assumptions written into the app, not data. Different, equally reasonable numbers would give a different reading.
- The misrouted walk is also chosen by the app, not by the walker. It shows one way out of the expected walk, not what a person would choose.
- The edge of the kit is where the data stops, not the edge of the city. The small commuter bonus there is only a rough stand-in for arriving from outside. There is no station or bus data.
- The time rules are assumptions as well. They describe who a city might expect at a given hour, not counts of who is out.
- Because the expected and misrouted routes are measured only where they leave the shortest route, the three percentages are not measured over the same streets. They compare each route's own streets, not whole walks.
- The census rent is for flats, so it is used only as a weak hint for students and not for visitors.
- Most streets in the kit are lined with mixed uses, so the routes often differ by only a few points. For short walks there is often only one sensible way. In a test of 200 random walks on a weekday at 12:00, the expected route was the same as the shortest route in 51 walks and the misrouted walk in 11, all of them shorter than 370 m; in 9 walks all three routes were the same. Where they differed, the expected route scored on average 43 %, the misrouted walk 48 %, and the shortest route 45 % over all walks. The middle gap between the expected and the misrouted walk was 6 points. The misrouted walk was typically 1.2 times as long as the shortest route, at most 1.9 times; it had to be softened in 2 walks and never fell back to the shortest route. At other times the averages moved by only 1 to 3 points.
- Play the day counts two misrouted walks as different ways when they differ by a single street. Two ways can therefore look almost the same on the map. The number of ways depends on the time rules, which are assumptions: it shows how the app's reading changes over the day, not how anyone's walk does.
- Leaving the other two routes is a rule of the app, not a sign of a better or worse street: the misrouted walk partly scores a little lower than before (48 % instead of 50 %) because it now also takes streets that are only "not the usual way".
- Floor areas per use are estimates for whole buildings, and about an eighth of all floor area in the kit has no known use.

## Data sources

All data is in `public/data/` and described in `public/data/SOURCES.md`. Nothing is fetched from the internet.

- `buildings.geojson`: footprints and heights from the 3D building models LoD2 of Thuringia, © GDI-Th, licence dl-de/by-2-0. Uses were added by Egor Gaydukov.
- `streets.graph.json`: the pedestrian network, by Egor Gaydukov, InfAU, Bauhaus-Universität Weimar.
- `zensus.geojson`: Zensus 2022, 100 m grid, © Statistische Ämter des Bundes und der Länder, licence dl-de/by-2-0.

The map carries this line:

> Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).

## How this was made

1. Tools: Claude Code, with the model Claude Opus 5.5.
2. I decided: so far I followed the course steps: the starter prompt, then a list of shops within 5 minutes, as in class.
3. The agent did: read the city kit, wrote the walking, band and resident calculations and the 3D view with React Three Fiber, tested them in a browser, and wrote this README. For the second mode, it proposed the profile rules, the affinity table and the scoring, then wrote them after my changes. It tested 200 random walks, found that the street scores were too close together to change the routes, and switched to ranking the streets. It checked both modes in a browser and wrote the section above. In a second round it proposed the time rules, then added them with my two additions, changed the route colours, measured the expected and misrouted routes only where they leave the shortest route, re-ran the test and updated the figures here. In a third round it made the misrouted walk avoid the streets of the shortest and expected routes, added the hint for walks too short to stray, re-ran the test and updated the figures again. In a fourth round it proposed how to draw the bands, tint the buildings and play the day, then built them with my two answers (return to the set hour after playing; stronger traces for ways shared by more hours), added a legend for this view, and checked playback, pausing and clearing in a browser. In a fifth round it drew the expected and misrouted routes again as solid lines on their bands, made the traces dotted with a legend row and a label of their hours on hover.
4. I checked: the app runs locally and on GitHub Pages; the areas, counts, shop list and attribution appear when I click.
