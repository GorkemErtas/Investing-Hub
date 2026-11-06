"""Compatibility entry point for incremental sync; see pipeline.py --help."""
if __name__ == '__main__':
    import sys
    from pipeline import main
    sys.exit(main(['sync', *sys.argv[1:]]))
