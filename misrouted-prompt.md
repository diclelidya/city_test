# How far can you walk from yourself?

Add a second mode to the walking map, next to the existing walking reach, with a small switch between the two. Keep the walking reach working exactly as it is.

**Idea.** The walking reach asks how far you can walk. This mode asks how far you can walk from yourself: from the walk the city expects of you. The city reads people by where they come from and where they go, and routes them along what it expects of them. This mode makes that reading visible, then misroutes the walker along a way their profile would never take, and measures how far it takes them from that profile.

**Clicks.** In this mode, the first click on the ground sets the start (A), the second sets the destination (B), a third click starts over. Snap both to the nearest walkable node, as the walking reach does.

**Profile.** Read the surroundings of A and B: the floor area per use of buildings within about 100 m, and the census cell (avg_age, rent_eur_m2; skip null values). Estimate a mix of five profiles, as shares that add up to 100 %:
visitor, student, local resident, older resident, commuter (someone who comes into the city to work).
- The profile comes mainly from A: where someone lives or stays.
- B updates it in proportion to how telling the destination is: education points strongly to students, accommodation and culture to visitors, health a little to older residents; retail and food barely change it, because everyone goes there.
- A near transport use or at the edge of the kit points to commuters.
Also name the purpose of the trip from B (shopping, work, study, culture, health, food).
Give each profile an affinity from 0 to 1 for each building use; the mix's affinity is the share-weighted average. Keep the rules simple and readable, and write them down in plain words.

**Routes.** Draw three routes from A to B on the street graph:
1. the shortest route, thin and grey;
2. the expected route: cheaper along streets whose nearby buildings (within about 25 m) have uses with high affinity for the mix;
3. the misrouted walk, in one accent colour: cheaper along streets whose nearby buildings have uses with low affinity for the mix.
The misrouted walk may be at most twice as long as the shortest route.

**Distance from yourself.** For each route, take the buildings within about 25 m of it, weight each by its floor area, and compute 1 minus their average affinity for the mix, as a percentage. The expected route should score low, the misrouted walk high.

**On screen.** A small panel titled "How far can you walk from yourself?" with:
- "The city reads this walk as …" and the profile shares as bars, and the purpose;
- for each route: its length in metres, minutes at 80 m per minute, the main uses it passes, and its distance from yourself;
- in plain words: how the profile is guessed, that it is a guess and not a fact about anyone, and how the distance from yourself is measured.
Keep the attribution line.

**Before you build**, tell me in a few lines how you will score the profiles, the streets and the distance from yourself. Propose the affinity table, and say how you will treat the `undefined` use and streets with no buildings nearby. Then wait for my answer.

**Stack and hosting.** Follow CLAUDE.md. It must work on localhost and on GitHub Pages.

**README.** Add a section for this mode: what it does, the rules, the limits. Among the limits, say that the profile weights and affinities are assumptions, not data, and that the misrouted walk is also chosen by the app, not by the walker. Update "How this was made", leaving "I decided" and "I checked" for me.

Don't commit or push. I'll check it first.