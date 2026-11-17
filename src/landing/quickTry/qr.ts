const SVG = 'http://www.w3.org/2000/svg';

// Draws a QR code of `text` into `svg` (error correction M, two cells of
// white around it): one white ground and one path of the dark cells, made with
// DOM calls, so the page's security policy (no inline style) holds. The
// library loads only when a code is drawn; a load that fails rejects.
export async function drawQr(svg: SVGSVGElement, text: string): Promise<void> {
  const { encode } = await import('uqr');
  const { data } = encode(text, { ecc: 'M', border: 2 });
  const size = data.length;
  let cells = '';
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) cells += `M${x} ${y}h1v1h-1z`;
    });
  });
  const ground = document.createElementNS(SVG, 'rect');
  ground.setAttribute('width', String(size));
  ground.setAttribute('height', String(size));
  ground.setAttribute('fill', '#ffffff');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', cells);
  path.setAttribute('fill', '#000000');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.replaceChildren(ground, path);
}
