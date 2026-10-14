# How far can you walk? Weimar

A 3D web app of central Weimar that shows how far you can walk in 5, 10 and 15 minutes from any point, and about how many people live there.

## What it does

- Shows the whole city kit in 3D. Buildings rise from their footprints to their measured height and are coloured by their main use, with a legend. The street network is drawn as thin lines on a pale ground.
- Drag to orbit, right-drag to pan, and scroll to zoom.
- Click on the ground (or on a building) to start a walk from the nearest street node. The app draws three nested areas for 5, 10 and 15 minutes in three shades of violet, and colours every building that touches an area in the matching shade.
- A panel lists the number of buildings reached and about how many residents live in each area.
- Below it, a list of the buildings with shop space within 5 minutes, largest retail area first, each with an orange pin on the map. Hover or click a row to find its pin; click a pin to find its row.

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
3. The agent did: read the city kit, wrote the walking, band and resident calculations and the 3D view with React Three Fiber, tested them in a browser, and wrote this README.
4. I checked: the app runs locally and on GitHub Pages; the areas, counts, shop list and attribution appear when I click.
