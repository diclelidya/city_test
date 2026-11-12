// What straying costs: the misrouted walk's extra minutes over the shortest route, at 80 m per minute.
// The panel card and the label at B both use this, so they always show the same number.
export const extraMinutes = (routes) => Math.round((routes.misrouted.length - routes.shortest.length) / 80)
