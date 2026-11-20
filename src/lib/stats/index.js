// @ts-check
export {
  erfc,
  normalPdf,
  normalCdf,
  normalSf,
  inverseNormalCdf,
  criticalZ,
  pValue,
} from "./normal.js";
export {
  linearRegression,
  predict,
  classifyCorrelation,
  STRENGTH_SCALE,
  MAX_POINTS,
} from "./regression.js";
export {
  oneMeanZTest,
  oneProportionZTest,
  twoMeansZTest,
  twoProportionsZTest,
  TAIL_OPERATOR,
} from "./ztest.js";
export { tPdf, tCdf, tSf, tIsf, tInv, criticalT, tPValue } from "./distributions.js";
export { oneSampleTTest, twoSampleTTest, pairedTTest } from "./ttest.js";
export { parseNumber, parsePairs, parseSamples } from "./parse.js";
export { compensatedSum } from "./summation.js";
