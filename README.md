# Labeller

Live: https://davepagurek.github.io/StrokeAggregatorLabeller/

## Local setup

From the base directory, run:

```
python -m SimpleHTTPServer
```

This statically servers the files in the directory, allowing the js app to dynamically load content from it.

Open `localhost` at the port specified in the output of the python command (generally, `localhost:8000`).

## UI usage

- Click on a path to select its group.
- With a group selected:
  - Press the 1 key to enter merge mode. Any group you click on after this will be merged into the selected group.
  - Press 2 to enter split mode. Individual paths you select will become highlighted.
    - Press 3 to apply the split, making all highlighted paths their own group.
    - If only one path is selected, pressing 4 will allow you to split the stroke into two. Move the mouse left and right to pick the split location and press 4 again to apply the split.
- Press Esc to clear the current selection (and cancel an in-progress merge.)
- The Export .scap button downloads a .scap of the current state.

## New inputs

Add lines to the file `inputs.js`. These are the file base names in the data folder without extensions.
