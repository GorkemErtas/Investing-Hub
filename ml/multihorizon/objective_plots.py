"""Standalone scientific figures from measured development evidence, never forecasts."""
import json
import os
from pathlib import Path


def plot_reliability(directory):
    directory = Path(directory)
    os.environ.setdefault('MPLCONFIGDIR', str(Path('.npm-cache/matplotlib').resolve()))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    index = json.loads((directory/'evidence.json').read_text(encoding='utf-8'))
    colors = {0: '#a54646', 1: '#65758a', 2: '#20856a'}
    labels = {0: 'Down', 1: 'Neutral', 2: 'Up'}
    for horizon in ('1m', '15m', '1h'):
        figure, axes = plt.subplots(4, 2, figsize=(11, 12), constrained_layout=True)
        entries = [e for e in index['pairs'] if e['horizon'] == horizon]
        for axis, entry in zip(axes.flat, entries):
            pair = json.loads((directory/entry['file']).read_text(encoding='utf-8'))
            decision = pair['decisions']['direction']
            axis.plot([0, 1], [0, 1], '--', color='#b0b0b0', linewidth=.8)
            if decision:
                for label in (0, 1, 2):
                    bins = [b for b in decision['metrics']['reliability'] if b['class'] == label and b['samples'] >= 25]
                    axis.plot([b['probability'] for b in bins], [b['observedFrequency'] for b in bins],
                              'o-', color=colors[label], label=labels[label], markersize=3, linewidth=1)
                axis.set_title(f'{pair["symbol"]}: ECE {decision["metrics"]["ece"]:.3f}', fontsize=10)
            axis.set(xlim=(0, 1), ylim=(0, 1), xlabel='Mean calibrated probability', ylabel='Observed class frequency')
            axis.grid(alpha=.15)
        handles, legend_labels = axes.flat[0].get_legend_handles_labels()
        figure.legend(handles, legend_labels, loc='outside lower center', ncols=3)
        figure.suptitle(f'Development reliability, {horizon} — future confirmation pending\nBins with at least 25 observations; model selection uses these historical windows', fontsize=12)
        destination = directory/f'reliability-{horizon}.svg'
        figure.savefig(destination, metadata={'Date': None})
        # Matplotlib emits trailing spaces inside multiline SVG path attributes.
        destination.write_text('\n'.join(line.rstrip() for line in
            destination.read_text(encoding='utf-8').splitlines())+'\n', encoding='utf-8')
        plt.close(figure)
    return {'matplotlib': matplotlib.__version__, 'figures': ['reliability-1m.svg', 'reliability-15m.svg', 'reliability-1h.svg']}
