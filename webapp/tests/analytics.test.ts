import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AnalyticsPlot } from '../src/components/AnalyticsPlot';
describe('analytical chart accessibility and empty inputs', () => {
  it('shows a precise empty state and never invents an empty series', () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsPlot, { title: 'TEST FIXTURE', values: [] }),
    );
    expect(html).toContain('Insufficient observations');
    expect(html).not.toContain('<svg');
  });
  it('uses finite axes for constant and negative data with accessible descriptions', () => {
    for (const values of [
      [0, 0, 0],
      [-0.2, -0.1, 0.05],
    ]) {
      const html = renderToStaticMarkup(
        createElement(AnalyticsPlot, { title: 'TEST FIXTURE returns', values }),
      );
      expect(html).toContain('role="img"');
      expect(html).toContain('3 observations');
      expect(html).not.toMatch(/NaN|Infinity/);
    }
  });
  it('preserves missing observations as separate line segments', () => {
    const html = renderToStaticMarkup(
      createElement(AnalyticsPlot, {
        title: 'TEST FIXTURE gaps',
        values: [0.1, 0.2, null, 0.3, 0.4],
      }),
    );
    expect(html.match(/<polyline/g)).toHaveLength(2);
    expect(html).toContain('Missing samples remain gaps');
  });
});
