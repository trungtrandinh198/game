/* eslint-disable @typescript-eslint/no-unused-vars */
declare module "clipper-lib" {
  interface Point {
    X: number;
    Y: number;
  }
  interface PolyNode {
    IsHole(): boolean;
    Contour(): Point[];
    Childs(): PolyNode[];
  }
  class PolyTree {
    Childs(): PolyNode[];
  }
  class Clipper {
    static Orientation(path: Point[]): boolean;
    AddPaths(paths: Point[][], type: number, closed: boolean): boolean;
    Execute(op: number, solution: PolyTree, subjFill: number, clipFill: number): boolean;
  }
  class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: Point[], join: number, end: number): void;
    Execute(solution: PolyTree, delta: number): void;
  }
  const ClipperLib: {
    Clipper: typeof Clipper;
    ClipperOffset: typeof ClipperOffset;
    PolyTree: typeof PolyTree;
    ClipType: { ctIntersection: number; ctUnion: number; ctDifference: number; ctXor: number };
    PolyType: { ptSubject: number; ptClip: number };
    PolyFillType: { pftEvenOdd: number; pftNonZero: number };
    JoinType: { jtSquare: number; jtRound: number; jtMiter: number };
    EndType: {
      etOpenButt: number;
      etOpenSquare: number;
      etOpenRound: number;
      etClosedLine: number;
      etClosedPolygon: number;
    };
  };
  export default ClipperLib;
}
