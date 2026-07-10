// Mermaid renders the svg with width="100%" and an inline
// style="max-width: Npx" for in-page responsiveness. Inline styles beat any
// stylesheet rule, so that constrains the svg's real rendered size independent
// of our transform-based zoom/pan — throwing off every size calculation.
// Strip it and pin the svg to its intrinsic pixel size instead.
export function normalizeSvgSize(svg, dims) {
  svg.removeAttribute('style');
  svg.setAttribute('width', dims.width);
  svg.setAttribute('height', dims.height);
}

export function getSvgDimensions(svg) {
  const widthAttr = svg.getAttribute('width');
  const heightAttr = svg.getAttribute('height');
  let width = 0;
  let height = 0;

  if (widthAttr && !widthAttr.includes('%')) {
    width = parseFloat(widthAttr) || 0;
  }
  if (heightAttr && !heightAttr.includes('%')) {
    height = parseFloat(heightAttr) || 0;
  }

  if ((!width || !height) && svg.viewBox && svg.viewBox.baseVal) {
    width = width || svg.viewBox.baseVal.width;
    height = height || svg.viewBox.baseVal.height;
  }

  if ((!width || !height) && typeof svg.getBBox === 'function') {
    const bbox = svg.getBBox();
    width = width || bbox.width;
    height = height || bbox.height;
  }

  return {
    width: width || 1,
    height: height || 1,
  };
}
