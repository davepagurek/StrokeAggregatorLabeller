const ns = 'http://www.w3.org/2000/svg'; // needs to be passed in when creating SVG elements
const picker = document.getElementById('picker'); // Used to select inputs
const svgContainer = document.getElementById('svgContainer');

// Groups are identified by their colour as a kind of guid
const chars = '0123456789abcdef';
const makeColor =
  () => '#' + [1,2,3,4,5,6].map(_ => chars.charAt(Math.floor(Math.random() * chars.length))).join('');

const state = {
  paths: [], // References to all svg path elements onscreen
  groups: {}, // Path elements indexed by their colour
  selection: null, // The group currently selected
  merge: false,
  split: false,
  subSelection: [], // In split mode, the individual path elements that are set to become their own group
  name: '', // The base name of the file

  setState: newState => {
    for (let key in newState) {
      if (key === 'paths') {
        // Recreate paths-by-colour index
        state.groups = {};
        newState.paths.forEach(p => {
          const group = state.getGroup(p);
          state.groups[group] = state.groups[group] || [];
          state.groups[group].push(p);
        });

      } else if (key === 'selection') {
        if (state.selection) {
          // Deselect all elements in the previously selected group
          state.groups[state.selection].forEach(p => p.classList.remove('selected'));
        }
        if (newState.selection) {
          // Select the elements in the new group
          state.groups[newState.selection].forEach(p => p.classList.add('selected'));
          document.body.classList.add('selection');
        } else {
          document.body.classList.remove('selection');
        }

      } else if (key === 'groups') {
        for (let color in newState.groups) {
          if (newState.groups[color]) {
            newState.groups[color].forEach(p => p.setAttribute('stroke', color));

            // If this group is the selected one, de-select and re-select everything in the group to
            // account for changed paths in the group
            if (color === state.selection) {
              state.groups[state.selection].forEach(p => p.classList.remove('selected'));
              newState.groups[state.selection].forEach(p => p.classList.add('selected'));
            }
          }
        }

      } else if (key == 'merge') {
        if (newState.merge) {
          document.body.classList.add('merge');
        } else {
          document.body.classList.remove('merge');
        }

      } else if (key == 'split') {
        if (newState.split) {
          document.body.classList.add('split');
        } else {
          document.body.classList.remove('split');
        }

      } else if (key === 'subSelection') {
        // Remove old elements from the sub selection
        state.subSelection.forEach(p => p.classList.remove('subSelection'));
        // Add new elements to the sub selection
        newState.subSelection.forEach(p => p.classList.add('subSelection'));

        // If anything is selected, show this in the UI by toggling a class on <body>
        if (newState.subSelection.length > 0) {
          document.body.classList.add('subSelection');
        } else {
          document.body.classList.remove('subSelection');
        }
      }

      state[key] = newState[key];
    }
  },

  getGroup: path => path.getAttribute('stroke') || '',

  getGroupMembers: group => state.groups[group] || [],

  subSelected: path => path.classList.contains('subSelection'),

  newGroup: () => {
    let c = makeColor();
    while (state.groups[c]) c = makeColor();

    return c;
  }
};

// Converts current state to a .scap file
const generateScap = () => {
  const svg = document.querySelector('svg');
  let nextGroup = 0;
  const groupIndex = {};
  for (let group in state.groups) {
    groupIndex[group] = nextGroup;
    nextGroup++;
  }

  return (
    `#${svg.getAttribute('width')} ${svg.getAttribute('height')}\n` +
    '@1.5\n' +
    Object.keys(state.groups).filter(g => state.groups[g]).map(group =>
      state.groups[group].map(path => (
        '{\n' +
        `\t#${path.getAttribute('data-globalId')}\t${groupIndex[group]}\n` +
        path
          .getAttribute('d')
          .substring(2)
          .split(' L ')
          .map(coord => `\t${coord.replace(' ', '\t')}\t0`)
          .join('\n') +
        '\n}\n'
      )).join('')
    ).join('')
  );
};

const setupLabeller = (name, svg) => {
  paths = [ ...svg.querySelectorAll('path') ];

  // Reset state
  state.setState({ name, paths });
  state.setState({ selection: null, merge: false, split: false, subSelection: [] });

  // Add click handlers on each new path element
  paths.forEach(path => {
    path.addEventListener('click', () => {
      if (state.merge) {
        if (state.getGroup(path) !== state.selection) {
          state.setState({
            groups: {
              ...state.groups,
              [ state.selection ]: [
                ...state.getGroupMembers(state.selection),
                ...state.getGroupMembers(state.getGroup(path))
              ],
              [ state.getGroup(path) ]: undefined
            }
          });
        }

      } else if (state.split) {
        if (state.subSelected(path)) {
          state.setState({
            subSelection: state.subSelection.filter(p => p !== path)
          });
        } else if (state.getGroup(path) === state.selection) {
          state.setState({
            subSelection: [ ...state.subSelection, path ]
          });
        }

      } else {
        state.setState({ selection: state.getGroup(path) });
      }
    });
  });
};

// Add keyboard handling
document.addEventListener('keyup', (event) => {
  if (document.body.classList.contains('selection')) {
    if (event.key === '1' && !state.merge && !state.split) {
      state.setState({ merge: true });
    } else if (event.key === '2' && !state.merge && !state.split) {
      state.setState({ split: true });
    } else if (event.key === '3' && state.split && state.subSelection.length > 0) {
      const oldSelection = state.selection;
      state.setState({ selection: null });
      state.setState({
        split: false,
        groups: {
          ...state.groups,
          [ oldSelection ]: state.getGroupMembers(oldSelection).filter(p => !state.subSelected(p)),
          [ state.newGroup() ]: state.subSelection
        },
        subSelection: []
      });
    } else if (event.key === 'Escape') {
      state.setState({
        split: false,
        merge: false,
        subSelection: [],
        selection: null
      });
    }
  }
});

document.getElementById('scap').addEventListener('click', () => {
  const downloadLink = document.createElement('a');
  const blob = new Blob([generateScap()], { type: 'text/plain;charset=utf-8' });
  downloadLink.setAttribute('href', URL.createObjectURL(blob));
  downloadLink.setAttribute('download', `${state.name}_cleaned.scap`);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
});

// .scap reader. Currently unused, but useful for verifying in the js console that the
// export feature actually produces readable files
const scapToSVG = scap => {
  const tokens = scap.split(/\s+/m);
  let w = 100;
  let h = 100;
  const groups = {};

  const readSize = () => {
    w = tokens.shift().substring(1);
    h = tokens.shift();
  };

  const readThickness = () => {
    if (tokens[0].startsWith('@')) tokens.shift();
  };

  const readStroke = () => {
    tokens.shift();
    const globalId = tokens.shift().substring(1);
    const group = parseInt(tokens.shift());
    readThickness();
    const polyline = [];
    while (tokens.length>=3 && !tokens[0].startsWith('}')) {
      const x = tokens.shift();
      const y = tokens.shift();
      tokens.shift();
      polyline.push(`${x} ${y}`);
    }
    tokens.shift();

    groups[group] = groups[group] || [];
    groups[group].push({ globalId, polyline });
  }

  const readStrokes = () => {
    while (tokens[0] && tokens[0] == '{') readStroke();
  };

  const readScap = () => {
    readSize();
    readThickness();
    readStrokes();
  };

  readScap();

  colors = {};
  groupColors = {};
  for (let group in groups) {
    let c = makeColor();
    while (colors[c]) c = makeColor();
    colors[c] = true;
    groupColors[group] = c;
  }

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  for (let group in groups) {
    groups[group].forEach(({ globalId, polyline }) => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${polyline[0]} ${polyline.slice(1).map(c => 'L '+c).join(' ')}`);
      path.setAttribute('data-globalId', globalId);
      path.setAttribute('stroke', groupColors[group]);
      svg.appendChild(path);
    });
  }

  return svg;
};

const loadInput = () => {
  const name = picker.value;
  if (!name) {
    return;
  }

  //fetch(`data/${name}_t_m_result_cluster.svg`)
  fetch(`data/${name}_t_m_result_cluster.scap`)
    .then(resp => resp.text())
    .then(src => {
      //console.log(src);
      while (svgContainer.firstChild) svgContainer.removeChild(svgContainer.firstChild);
      state.setState({ selection: null });
      svgContainer.appendChild(scapToSVG(src));
      //svgContainer.innerHTML = src;
      setupLabeller(name, svgContainer.querySelector('svg'));
    });
};

picker.addEventListener('change', loadInput);

inputs.forEach((name, i) => {
  const option = document.createElement('option');
  option.innerText = name;
  option.value = name;
  picker.appendChild(option);

  if (i === 0) {
    option.selected = true;
    loadInput();
  }
});
