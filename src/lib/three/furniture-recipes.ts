export interface FurniturePart {
  /** size in meters: [width, height, depth] */
  size: [number, number, number];
  /** position offset from the furniture's floor-center anchor, y=0 is the floor */
  position: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
}

export interface FurnitureRecipe {
  parts: FurniturePart[];
  /** overall footprint, used for slot spacing/collision-free layout */
  footprint: [number, number]; // width, depth
}

const WOOD = "#b8926a";
const WOOD_DARK = "#8a6444";
const FABRIC_RED = "#b3766b";
const METAL = "#cdd3d8";
const DARK = "#2e2f33";
const CREAM = "#e8e2d4";
const GREEN = "#8faf8a";
const SOFA_LEATHER = "#dd7f36";
const SOFA_LEATHER_DARK = "#b3652a";
const SOFA_LEG = "#2a1810";

function box(size: FurniturePart["size"], position: FurniturePart["position"], color: string, extra?: Partial<FurniturePart>): FurniturePart {
  return { size, position, color, ...extra };
}

const RECIPES: Record<string, FurnitureRecipe> = {
  sofa: {
    footprint: [1.8, 0.85],
    parts: [
      // tapered wood legs
      box([0.06, 0.16, 0.06], [-0.78, 0.08, -0.32], SOFA_LEG, { roughness: 0.6, metalness: 0.1 }),
      box([0.06, 0.16, 0.06], [0.78, 0.08, -0.32], SOFA_LEG, { roughness: 0.6, metalness: 0.1 }),
      box([0.06, 0.16, 0.06], [-0.78, 0.08, 0.32], SOFA_LEG, { roughness: 0.6, metalness: 0.1 }),
      box([0.06, 0.16, 0.06], [0.78, 0.08, 0.32], SOFA_LEG, { roughness: 0.6, metalness: 0.1 }),
      // skirt / base frame
      box([1.72, 0.14, 0.76], [0, 0.23, 0], SOFA_LEATHER_DARK, { roughness: 0.45 }),
      // two seat cushions with a thin center seam
      box([0.82, 0.22, 0.74], [-0.42, 0.41, 0], SOFA_LEATHER, { roughness: 0.4 }),
      box([0.82, 0.22, 0.74], [0.42, 0.41, 0], SOFA_LEATHER, { roughness: 0.4 }),
      // tufted backrest
      box([1.72, 0.42, 0.16], [0, 0.51, -0.32], SOFA_LEATHER, { roughness: 0.4 }),
      // rolled armrests: body + rounded cap
      box([0.16, 0.42, 0.74], [-0.8, 0.37, 0], SOFA_LEATHER, { roughness: 0.4 }),
      box([0.16, 0.42, 0.74], [0.8, 0.37, 0], SOFA_LEATHER, { roughness: 0.4 }),
      box([0.2, 0.12, 0.78], [-0.8, 0.64, 0], SOFA_LEATHER, { roughness: 0.4 }),
      box([0.2, 0.12, 0.78], [0.8, 0.64, 0], SOFA_LEATHER, { roughness: 0.4 }),
      // tufted buttons (2x2 grid on each backrest half)
      box([0.045, 0.045, 0.02], [-0.555, 0.46, -0.239], SOFA_LEATHER_DARK),
      box([0.045, 0.045, 0.02], [-0.255, 0.46, -0.239], SOFA_LEATHER_DARK),
      box([0.045, 0.045, 0.02], [-0.555, 0.6, -0.239], SOFA_LEATHER_DARK),
      box([0.045, 0.045, 0.02], [-0.255, 0.6, -0.239], SOFA_LEATHER_DARK),
      box([0.045, 0.045, 0.02], [0.255, 0.46, -0.239], SOFA_LEATHER_DARK),
      box([0.045, 0.045, 0.02], [0.555, 0.46, -0.239], SOFA_LEATHER_DARK),
      box([0.045, 0.045, 0.02], [0.255, 0.6, -0.239], SOFA_LEATHER_DARK),
      box([0.045, 0.045, 0.02], [0.555, 0.6, -0.239], SOFA_LEATHER_DARK),
    ],
  },
  bed: {
    footprint: [1.6, 2.0],
    parts: [
      box([1.6, 0.32, 2.0], [0, 0.16, 0], CREAM),
      box([1.6, 0.55, 0.1], [0, 0.4, -0.95], WOOD_DARK),
      box([0.6, 0.12, 0.4], [-0.45, 0.38, -0.7], "#f4f0e6"),
      box([0.6, 0.12, 0.4], [0.45, 0.38, -0.7], "#f4f0e6"),
    ],
  },
  wardrobe: {
    footprint: [1.4, 0.6],
    parts: [
      box([1.4, 1.9, 0.6], [0, 0.95, 0], WOOD, { roughness: 0.7 }),
      box([0.02, 1.7, 0.02], [-0.01, 0.95, 0.31], WOOD_DARK),
      box([0.02, 1.7, 0.02], [0.01, 0.95, 0.31], WOOD_DARK),
      box([0.06, 0.08, 0.02], [-0.15, 0.95, 0.31], "#5a4632"),
      box([0.06, 0.08, 0.02], [0.15, 0.95, 0.31], "#5a4632"),
    ],
  },
  chest_of_drawers: {
    footprint: [1.0, 0.5],
    parts: [
      box([1.0, 1.0, 0.5], [0, 0.5, 0], WOOD_DARK),
      box([0.9, 0.18, 0.02], [0, 0.25, 0.26], "#5a4632"),
      box([0.9, 0.18, 0.02], [0, 0.5, 0.26], "#5a4632"),
      box([0.9, 0.18, 0.02], [0, 0.75, 0.26], "#5a4632"),
    ],
  },
  bedside_table: {
    footprint: [0.5, 0.45],
    parts: [box([0.5, 0.55, 0.45], [0, 0.275, 0], WOOD), box([0.4, 0.05, 0.02], [0, 0.4, 0.24], "#5a4632")],
  },
  dressing_table: {
    footprint: [1.1, 0.5],
    parts: [
      box([1.1, 0.75, 0.5], [0, 0.375, 0], WOOD),
      box([0.5, 0.6, 0.03], [0, 1.0, -0.2], "#dfeaf0", { metalness: 0.3, roughness: 0.1 }),
    ],
  },
  suitcase: {
    footprint: [0.6, 0.4],
    parts: [box([0.6, 0.4, 0.4], [0, 0.2, 0], FABRIC_RED), box([0.6, 0.04, 0.42], [0, 0.4, 0], WOOD_DARK)],
  },
  tv_unit: {
    footprint: [1.6, 0.45],
    parts: [
      box([1.6, 0.45, 0.45], [0, 0.225, 0], WOOD_DARK),
      box([1.1, 0.65, 0.05], [0, 0.78, -0.15], DARK, { roughness: 0.2 }),
    ],
  },
  coffee_table: {
    footprint: [0.9, 0.5],
    parts: [
      box([0.9, 0.05, 0.5], [0, 0.4, 0], WOOD),
      box([0.06, 0.4, 0.06], [-0.4, 0.2, -0.2], WOOD_DARK),
      box([0.06, 0.4, 0.06], [0.4, 0.2, -0.2], WOOD_DARK),
      box([0.06, 0.4, 0.06], [-0.4, 0.2, 0.2], WOOD_DARK),
      box([0.06, 0.4, 0.06], [0.4, 0.2, 0.2], WOOD_DARK),
    ],
  },
  side_table: {
    footprint: [0.45, 0.45],
    parts: [
      box([0.45, 0.04, 0.45], [0, 0.5, 0], WOOD),
      box([0.05, 0.5, 0.05], [-0.18, 0.25, -0.18], WOOD_DARK),
      box([0.05, 0.5, 0.05], [0.18, 0.25, -0.18], WOOD_DARK),
      box([0.05, 0.5, 0.05], [-0.18, 0.25, 0.18], WOOD_DARK),
      box([0.05, 0.5, 0.05], [0.18, 0.25, 0.18], WOOD_DARK),
    ],
  },
  study_table: {
    footprint: [1.2, 0.6],
    parts: [
      box([1.2, 0.05, 0.6], [0, 0.72, 0], WOOD),
      box([0.06, 0.72, 0.06], [-0.55, 0.36, -0.25], WOOD_DARK),
      box([0.06, 0.72, 0.06], [0.55, 0.36, -0.25], WOOD_DARK),
      box([0.06, 0.72, 0.06], [-0.55, 0.36, 0.25], WOOD_DARK),
      box([0.06, 0.72, 0.06], [0.55, 0.36, 0.25], WOOD_DARK),
    ],
  },
  bookshelf: {
    footprint: [1.0, 0.35],
    parts: [
      box([1.0, 1.9, 0.35], [0, 0.95, 0], WOOD_DARK),
      box([0.92, 0.03, 0.3], [0, 0.55, 0.02], WOOD),
      box([0.92, 0.03, 0.3], [0, 1.1, 0.02], WOOD),
      box([0.92, 0.03, 0.3], [0, 1.65, 0.02], WOOD),
    ],
  },
  cabinet: {
    footprint: [1.1, 0.5],
    parts: [
      box([1.1, 1.6, 0.5], [0, 0.8, 0], WOOD, { roughness: 0.7 }),
      box([0.02, 1.4, 0.02], [0, 0.8, 0.26], WOOD_DARK),
    ],
  },
  showcase: {
    footprint: [1.0, 0.4],
    parts: [
      box([1.0, 1.7, 0.4], [0, 0.85, 0], "#d8cdb8"),
      box([0.9, 1.5, 0.02], [0, 0.85, 0.2], "#bcd4e0", { metalness: 0.1, roughness: 0.05 }),
    ],
  },
  shoe_rack: {
    footprint: [0.9, 0.35],
    parts: [
      box([0.9, 0.9, 0.35], [0, 0.45, 0], WOOD),
      box([0.82, 0.02, 0.3], [0, 0.3, 0], WOOD_DARK),
      box([0.82, 0.02, 0.3], [0, 0.6, 0], WOOD_DARK),
    ],
  },
  storage_box: {
    footprint: [0.5, 0.4],
    parts: [box([0.5, 0.4, 0.4], [0, 0.2, 0], "#c9a15a")],
  },
  box: { footprint: [0.45, 0.4], parts: [box([0.45, 0.4, 0.4], [0, 0.2, 0], "#c9a15a")] },
  bag: {
    footprint: [0.35, 0.3],
    parts: [box([0.35, 0.4, 0.3], [0, 0.2, 0], "#93694f"), box([0.28, 0.1, 0.04], [0, 0.45, 0], "#6b4a36")],
  },
  drawer: {
    footprint: [0.8, 0.5],
    parts: [box([0.8, 0.9, 0.5], [0, 0.45, 0], WOOD_DARK), box([0.7, 0.15, 0.02], [0, 0.6, 0.26], "#5a4632")],
  },
  shelf: {
    footprint: [0.9, 0.3],
    parts: [
      box([0.9, 1.5, 0.3], [0, 0.75, 0], WOOD),
      box([0.85, 0.02, 0.28], [0, 0.5, 0], WOOD_DARK),
      box([0.85, 0.02, 0.28], [0, 1.0, 0], WOOD_DARK),
    ],
  },
  locker: {
    footprint: [0.6, 0.5],
    parts: [box([0.6, 1.8, 0.5], [0, 0.9, 0], "#8a9296", { metalness: 0.4, roughness: 0.4 })],
  },
  kitchen_cabinet: {
    footprint: [1.2, 0.55],
    parts: [
      box([1.2, 0.9, 0.55], [0, 0.45, 0], CREAM),
      box([1.14, 0.05, 0.58], [0, 0.92, 0], WOOD_DARK),
    ],
  },
  wall_cabinet: {
    footprint: [1.1, 0.35],
    parts: [box([1.1, 0.7, 0.35], [0, 1.5, 0], CREAM)],
  },
  pantry: {
    footprint: [0.9, 0.55],
    parts: [box([0.9, 2.0, 0.55], [0, 1.0, 0], CREAM, { roughness: 0.6 })],
  },
  refrigerator: {
    footprint: [0.75, 0.7],
    parts: [
      box([0.75, 1.8, 0.7], [0, 0.9, 0], METAL, { metalness: 0.6, roughness: 0.3 }),
      box([0.02, 1.7, 0.02], [-0.3, 0.9, 0.36], "#9aa1a6"),
    ],
  },
  storage_rack: {
    footprint: [1.0, 0.4],
    parts: [
      box([1.0, 1.6, 0.4], [0, 0.8, 0], "#9a9490", { metalness: 0.3, roughness: 0.5 }),
      box([0.95, 0.02, 0.38], [0, 0.5, 0], "#7a746f"),
      box([0.95, 0.02, 0.38], [0, 1.1, 0], "#7a746f"),
    ],
  },
  container_shelf: {
    footprint: [0.9, 0.35],
    parts: [
      box([0.9, 1.4, 0.35], [0, 0.7, 0], WOOD),
      box([0.4, 0.3, 0.28], [-0.2, 0.5, 0], "#bcd4e0", { metalness: 0.1 }),
      box([0.4, 0.3, 0.28], [0.2, 1.0, 0], "#e0c9bc", { metalness: 0.1 }),
    ],
  },
  other: { footprint: [0.6, 0.5], parts: [box([0.6, 0.55, 0.5], [0, 0.275, 0], GREEN)] },
};

const DEFAULT_RECIPE: FurnitureRecipe = RECIPES.other;

export function getFurnitureRecipe(type: string): FurnitureRecipe {
  return RECIPES[type] ?? DEFAULT_RECIPE;
}
