"""Registry-only offline inference; executable artifact paths are unsupported."""
if __name__ == '__main__':
    import sys
    from pipeline import main
    sys.exit(main(['predict', *sys.argv[1:]]))
