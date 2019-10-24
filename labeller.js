const ns = 'http://www.w3.org/2000/svg'; // needs to be passed in when creating SVG elements
const picker = document.getElementById('picker'); // Used to select inputs
const svgContainer = document.getElementById('svgContainer');
const reference = document.getElementById('reference');

const COUNTDOWN_LENGTH = 1; // 20
let startTime = null;
let zoom = 1;

const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');

// Groups are identified by their colour as a kind of guid
const chars = '0123456789abcdef';
const makeSingleColor =
  () => '#' + [1,2,3,4,5,6].map(_ => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
const makeColor = () => {
  let color = makeSingleColor();
  const badColor = cHex => {
    const c = hexToRGB(cHex);
    const b = Math.hypot(c.r, c.g, c.b);
    const maxVal = Math.max(c.r, c.g, c.b);
    const minVal = Math.min(c.r, c.g, c.b);
    return b < 0.7*255 || b > 0.95*255 || maxVal - minVal < 50;
  };
  while (badColor(color)) color = makeSingleColor();
  return color;
};

const hexToRGB = hex => {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};
const tooClose = (aHex, bHex) => {
  a = hexToRGB(aHex);
  b = hexToRGB(bHex);
  return Math.hypot(a.r-b.r, a.g-b.g, a.b-b.b) < 100;
};

const notify = p => {
  p.classList.remove('notif');
  void p.offsetWidth;
  setTimeout(() => {
    p.classList.add('notif');
  }, 100);
};

let brushIndicator = null;

const undoStack = [];
const redoStack = [];
const updateButtons = () => {
  undoBtn.disabled = undoStack.length <= 1;
  redoBtn.disabled = redoStack.length == 0;
};
const undoKeys = new Set(['groups'])
const state = {
  paths: [], // References to all svg path elements onscreen
  groups: {}, // Path elements indexed by their colour
  pathSamples: new Map(),
  sampleLocations: [],
  selection: null, // The group currently selected
  merge: false,
  split: false,
  subSelection: [], // In split mode, the individual path elements that are set to become their own group
  radius: 5,
  name: '', // The base name of the file

  clone: (s) => {
    const mapObjValues = (obj, fn) => {
      const newObj = {};
      for (let key in obj) {
        if (obj[key] !== undefined) {
          newObj[key] = fn(obj[key]);
        } else {
          newObj[key] = undefined;
        }
      }
      return newObj;
    };
    const mapMapValues = (obj, fn) => {
      const newObj = new Map();
      [...obj.keys()].forEach(key => {
        newObj.set(key, fn(obj.get(key)));
      });
      return newObj;
    };

    return {
      ...s,
      paths: [...s.paths],
      groups: mapObjValues(s.groups, group => [...group]),
      pathSamples: mapMapValues(s.pathSamples, samples => [...samples]),
      subSelection: [...s.subSelection],
    };
  },

  loadState: newState => {
    const oldPaths = new Set(state.paths);
    const newPaths = new Set(newState.paths);
    const removed = new Set([...oldPaths].filter(p => !newPaths.has(p)))
    const added = new Set([...newPaths].filter(p => !oldPaths.has(p)))
    console.log(removed);
    console.log(added);
    const parent = state.paths[0].parentElement;
    removed.forEach(p => parent.removeChild(p));
    added.forEach(p => {
      parent.prepend(p);
      p.classList.remove('selected');
      notify(p);
    });
    state.paths = newState.paths;

    state.sampleLocations = newState.sampleLocations;
    state.pathSamples = newState.pathSamples;
    if (removed.size > 0) {
      const eachInTree = (tree, fn) => {
        if (!tree) return;
        tree.eq.forEach(s => fn(s));
        eachInTree(tree.lt, fn);
        eachInTree(tree.gt, fn);
      };

      eachInTree(state.sampleLocations, s => {
        if (removed.has(s.path)) {
          added.forEach(p => {
            if (state.pathSamples.get(p).includes(s)) {
              s.path = p;
            }
          });
        }
      });
    }

    if (state.selection && !newState.groups[state.selection]) {
      handleEscape();
    }
    if (state.subSelection && state.subSelection.some(p => !newState.groups[state.selection].includes(p))) {
      handleEscape();
    }
    state.setState({ groups: newState.groups }, true);
  },

  undo: () => {
    if (undoStack.length > 1) {
      redoStack.push(undoStack.pop());
      state.loadState(state.clone(undoStack[undoStack.length-1]));
    }
    updateButtons();
  },

  redo: () => {
    if (redoStack.length > 0) {
      undoStack.push(redoStack.pop());
      state.loadState(state.clone(undoStack[undoStack.length-1]));
    }
    updateButtons();
  },

  setState: (newState, fromStack = false) => {
    for (let key in newState) {
      if (key === 'paths') {
        // Recreate paths-by-colour index
        state.groups = {};
        newState.paths.forEach(p => {
          const group = state.getGroup(p);
          state.groups[group] = state.groups[group] || [];
          state.groups[group].push(p);
        });

        // Recreate path-from-location index
        state.pathSamples = new Map();
        const allSamples = [];
        newState.paths.forEach(p => {
          const samples = [];
          const length = p.getTotalLength();
          const SAMPLE_DISTANCE = 5;
          for (let i = 0; i <= length; i += SAMPLE_DISTANCE) {
            const pt = p.getPointAtLength(Math.min(length, i));
            const sample = { path: p, length: i, x: pt.x, y: pt.y };
            samples.push(sample);
            allSamples.push(sample);
          }
          state.pathSamples.set(p, samples);
        });

        const makeTree = (points, splitOn) => {
          if (points.length === 0) return null;
          points.sort((a,b) => a[splitOn] - b[splitOn]);
          const midIdx = Math.floor(points.length/2);
          const mid = points[midIdx];
          const nextSplitOn = splitOn == 'x' ? 'y' : 'x';
          return {
            splitOn,
            eq: points.filter(p => p[splitOn] == mid[splitOn]),
            gt: makeTree(points.filter(p => p[splitOn] > mid[splitOn]), nextSplitOn),
            lt: makeTree(points.filter(p => p[splitOn] < mid[splitOn]), nextSplitOn)
          };
        };
        state.sampleLocations = makeTree(allSamples, 'x');

      } else if (key === 'selection') {
        if (state.selection) {
          // Deselect all elements in the previously selected group
          if (state.groups[state.selection]) {
            state.groups[state.selection].forEach(p => p.classList.remove('selected'));
          }
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
            newState.groups[color].forEach(p => {
              if (p.getAttribute('stroke') != color) {
                notify(p);
                p.setAttribute('stroke', color);
              }
            });

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
        if (newState.subSelection.length === 1) {
          document.body.classList.add('single');
        } else {
          document.body.classList.remove('single');
        }

      } else if (key === 'radius') {
        brushIndicator.setAttribute('rx', newState.radius);
        brushIndicator.setAttribute('ry', newState.radius);
      }

      state[key] = newState[key];
    }

    if (!fromStack) {
      const changed = Object.keys(newState).some(k => undoKeys.has(k));
      if (changed) {
        state.commit();
      }
    }
  },

  commit: () => {
    undoStack.push(state.clone(state));
    while (redoStack.length > 0) redoStack.pop();
    if (undoStack.length > 10) {
      undoStack.shift();
    }
    updateButtons();
  },

  getGroup: path => path.getAttribute('stroke') || '',

  getGroupMembers: group => state.groups[group] || [],

  subSelected: path => path.classList.contains('subSelection'),

  newGroup: (surrounding = []) => {
    let c = makeColor();
    while (state.groups[c] || surrounding.find(color => tooClose(color, c))) c = makeColor();

    return c;
  },

  getPathsNear: (target, r) => {
    const paths = new Set();
    const rSqr = r*r;

    const traverse = (tree) => {
      if (!tree) return;
      const { splitOn } = tree;

      tree.eq.forEach(pt => {
        if (Math.pow(pt.x-target.x,2) + Math.pow(pt.y-target.y,2) <= rSqr) {
          paths.add(pt.path);
        }
      });

      if (tree.eq[0][splitOn] - r <= target[splitOn]) {
        traverse(tree.gt);
      }
      if (tree.eq[0][splitOn] + r >= target[splitOn]) {
        traverse(tree.lt);
      }
    };

    traverse(state.sampleLocations);
    return [...paths];
  }
};

// Converts current state to a .scap file
const generateScap = () => {
  const svg = document.querySelector('#svgContainer svg');

  let nextGroup = 0;
  const groupIndex = {};
  for (let group in state.groups) {
    groupIndex[group] = nextGroup;
    nextGroup++;
  }

  return (
    `#${svg.getAttribute('data-width')} ${svg.getAttribute('data-height')}\n` +
    '@1.5\n' +
    Object.keys(state.groups).filter(g => state.groups[g]).map(group =>
      state.groups[group].map(path => {
        const pathId = path.getAttribute('data-globalId');
        const id = pathId;
        return (
          '{\n' +
          `\t#${id}\t${groupIndex[group]}\n` +
          path
            .getAttribute('d')
            .substring(2)
            .split(' L ')
            .map(coord => `\t${coord.replace(' ', '\t')}\t0`)
            .join('\n') +
          '\n}\n'
        );
      }).join('')
    ).join('')
  );
};

const setupLabeller = (name, svg) => {
  startTime = new Date();
  document.body.classList.remove('timer');
  paths = [ ...svg.querySelectorAll('path') ];

  brushIndicator = document.createElementNS(ns, 'ellipse');
  brushIndicator.setAttribute('id', 'brushIndicator');
  brushIndicator.setAttribute('rx', state.radius);
  brushIndicator.setAttribute('ry', state.radius);
  brushIndicator.setAttribute('stroke', '#F0F');
  brushIndicator.setAttribute('stroke-width', '1');
  brushIndicator.setAttribute('fill', 'rgba(0,0,0,0.2)');
  svg.appendChild(brushIndicator);

  const pt = svg.createSVGPoint();
  const handleMouseMove = (event) => {
    pt.x = event.clientX;
    pt.y = event.clientY;
    const svgLoc = pt.matrixTransform(svg.getScreenCTM().inverse());
    brushIndicator.setAttribute('cx', svgLoc.x);
    brushIndicator.setAttribute('cy', svgLoc.y);
    return svgLoc;
  };
  svg.addEventListener('mousemove', (event) => {
    const target = handleMouseMove(event);
  });
  svg.addEventListener('click', (event) => {
    const target = handleMouseMove(event);
    let paths = state.getPathsNear(target, state.radius+1);
    if (!state.merge && !state.split) {
      let minDist = Infinity;
      let minPath = null;
      paths.forEach(p => {
        state.pathSamples.get(p).forEach(sample => {
          const dist = Math.hypot(target.x-sample.x, target.y-sample.y);
          if (dist < minDist) {
            minDist = dist;
            minPath = p;
          }
        });
      });
      if (minPath) {
        state.setState({ selection: state.getGroup(minPath) });
        document.body.classList.remove('unselected');
      }
    } else {
      if (state.merge) {
        let changed = false;
        paths.forEach(path => {
          if (state.getGroup(path) !== state.selection) {
            changed = true;
            state.setState({
              groups: {
                ...state.groups,
                [ state.selection ]: [
                  ...state.getGroupMembers(state.selection),
                  ...state.getGroupMembers(state.getGroup(path))
                ],
                [ state.getGroup(path) ]: undefined
              }
            }, true);
          }
        });
        if (changed) state.commit();

      } else if (state.split) {
        paths = paths.filter(p => state.getGroup(p) === state.selection);
        const allSelected = paths.every(path => state.subSelected(path));
        if (allSelected) {
          state.setState({
            subSelection: state.subSelection.filter(p => !paths.includes(p))
          });
        } else {
          state.setState({
            subSelection: [ ...state.subSelection, ...paths.filter(p =>  !state.subSelection.includes(p)) ]
          });
        }
      }
    }
  });

  // Reset state
  while (undoStack.length > 0) undoStack.pop();
  while (redoStack.length > 0) redoStack.pop();
  state.setState({ name, paths }, true);
  state.setState({ selection: null, merge: false, split: false, subSelection: [] }, true);
  state.commit();

  // Add click handlers on each new path element
  //paths.forEach(path => {
    //path.addEventListener('click', pathClickHandler(path))
  //});
};

const handleMerge = () => {
  if (!document.body.classList.contains('selection')) return;
  if (!state.merge && !state.split) {
    state.setState({ merge: true });
  }
};

const handleSplit = () => {
  if (!document.body.classList.contains('selection')) return;
  document.body.classList.remove('first-selection');
  if (!state.merge && !state.split) {
    state.setState({ split: true });
  }
};

const handleConfirm = () => {
  if (!document.body.classList.contains('selection')) return;
  if (state.split && state.subSelection.length > 0) {
    document.body.classList.remove('first-split');
    const oldSelection = state.selection;
    state.setState({ selection: null });

    const surrounding = [oldSelection];
    for (let color in state.groups) {
      if (!state.groups[color] || color == oldSelection) continue;

      let minDist = Infinity;
      state.subSelection.forEach(p1 => {
        for (let t1 = 0; t1 <= 1; t1 += 0.25) {
          const pt1 = p1.getPointAtLength(t1 * p1.getTotalLength());
          state.groups[color].forEach(p2 => {
            for (let t2 = 0; t2 <= 1; t2 += 0.25) {
              const pt2 = p2.getPointAtLength(t2 * p2.getTotalLength());
              minDist = Math.min(minDist, Math.hypot(pt2.x-pt1.x, pt2.y-pt1.y));
            }
          });
        }
      });

      if (minDist < 10) {
        surrounding.push(color);
      }
    }

    state.setState({
      selection: oldSelection,
      groups: {
        ...state.groups,
        [ oldSelection ]: state.getGroupMembers(oldSelection).filter(p => !state.subSelected(p)),
          [ state.newGroup(surrounding) ]: state.subSelection
      },
      subSelection: []
    });
  }
};

const handleEscape = () => {
  if (!document.body.classList.contains('selection')) return;
  if (state.selection) document.body.classList.remove('first-selection');
  if (state.subSelection.length > 0) document.body.classList.remove('first-split');
  state.setState({
    split: false,
    merge: false,
    subSelection: [],
    selection: null
  });
};

const zoomIn = () => {
  const svg = document.querySelector('#svgContainer svg');
  zoom++;
  svg.setAttribute('width', svg.clientWidth*2);
};

const zoomOut = () => {
  const svg = document.querySelector('#svgContainer svg');
  if (zoom == 1) return;
  zoom--;
  if (zoom == 1) {
    svg.removeAttribute('width');
  } else {
    svg.setAttribute('width', Math.round(svg.clientWidth/2));
  }
};

// Add keyboard handling
document.addEventListener('keydown', (event) => {
  if (event.key === '1' || event.key === 'm') {
    handleMerge();
  } else if (event.key === '2' || event.key === 'b') {
    handleSplit();
  } else if (event.key === '3' || event.key === 's') {
    handleConfirm();
  } else if (event.key === 'Escape') {
    handleEscape();
  } else if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
    event.preventDefault();
    event.stopPropagation();
    state.undo();
  } else if ((event.metaKey || event.ctrlKey) && ((event.shiftKey && (event.key === 'z' || event.key === 'Z')) || event.key === 'y')) {
    event.preventDefault();
    event.stopPropagation();
    state.redo();
  } else if ((event.metaKey || event.ctrlKey) && event.key === '=') {
    event.preventDefault();
    event.stopPropagation();
    zoomIn();
  } else if ((event.metaKey || event.ctrlKey) && event.key === '-') {
    event.preventDefault();
    event.stopPropagation();
    zoomOut();
  }
});
undoBtn.addEventListener('click', () => state.undo());
redoBtn.addEventListener('click', () => state.redo());
document.getElementById('merge').addEventListener('click', handleMerge);
document.getElementById('split').addEventListener('click', handleSplit);
document.getElementById('confirm').addEventListener('click', handleConfirm);
document.getElementById('escape').addEventListener('click', handleEscape);

const download = (content, filename) => {
  const downloadLink = document.createElement('a');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  downloadLink.setAttribute('href', URL.createObjectURL(blob));
  downloadLink.setAttribute('download', filename);
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
};

const downloadFiles = (start = '') => {
  const [prefix, suffix] = state.name.replace('data/','').split('.');
  const duration = Math.round((new Date().getTime() - startTime.getTime())/1000);
  download(generateScap(),  `${start}${prefix}_${duration}s_cleaned.scap`);
};
document.getElementById('done').addEventListener('click', () => downloadFiles());
document.getElementById('incomplete').addEventListener('click', () => downloadFiles('INCOMPLETE_'));

const scapToSVG = function*(scap) {
  const tokens = scap.split(/\s+/m);
  let w = 100;
  let h = 100;
  let thickness = 1;
  const groups = {};

  const readSize = () => {
    w = tokens.shift().substring(1);
    h = tokens.shift();
  };

  const readThickness = () => {
    if (tokens[0].startsWith('@')) {
      thickness = parseFloat(tokens.shift().substring(1));
    }
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
  yield false;

  colors = {};
  groupColors = {};
  for (let group in groups) {
    const surrounding = [];
    for (let other in groups) {
      if (!groupColors[other]) continue;

      let minDist = Infinity;
      groups[group].forEach(path1 => {
        const p1 = path1.polyline.map(p => p.split(' ').map(x => parseInt(x)));
        [p1[0], p1[Math.floor(p1.length/2)], p1[p1.length-1]].forEach(([x1,y1]) => {
          groups[other].forEach(path2 => {
            const p2 = path2.polyline.map(p => p.split(' ').map(x => parseInt(x)));
            [p2[0], p2[Math.floor(p2.length/2)], p2[p2.length-1]].forEach(([x2,y2]) => {
              minDist = Math.min(minDist, Math.hypot(x2-x1, y2-y1));
            });
          });
        });
      });

      if (minDist < 5) {
        surrounding.push(groupColors[other]);
      }
    }
    yield false;

    let c = makeColor();
    while (colors[c] || surrounding.find(color => tooClose(color, c))) c = makeColor();
    colors[c] = true;
    groupColors[group] = c;
    yield false;
  }

  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('data-width', w);
  svg.setAttribute('data-height', h);

  for (let group in groups) {
    groups[group].forEach(({ globalId, polyline }) => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${polyline[0]} ${polyline.slice(1).map(c => 'L '+c).join(' ')}`);
      path.setAttribute('data-globalId', globalId);
      path.setAttribute('stroke', groupColors[group]);
      path.setAttribute('stroke-width', thickness);
      svg.appendChild(path);
    });
  }

  yield svg;
};

let first = true;
const loadInput = () => {
  const name = picker.value;
  if (!name) {
    return;
  }

  while (svgContainer.firstChild) svgContainer.removeChild(svgContainer.firstChild);
  while (reference.firstChild) reference.removeChild(reference.firstChild);
  const loader = document.createElement('h2');
  loader.innerText = 'Processing...';
  reference.appendChild(loader);

  //fetch(`data/${name}_t_m_result_cluster.svg`)
  fetch(name)
    .then(resp => resp.text())
    .then(src => {
      //console.log(src);
      state.setState({ selection: null });
      const iterator = scapToSVG(src);

      const timeBudget = 1/30;
      let result = false;
      const incrementalWork = () => {
        const incrementalStartTime = new Date().getTime();

        const existsTimeRemaining = () =>
        (new Date().getTime() - incrementalStartTime) / 1000 < timeBudget;

        while (!result && existsTimeRemaining()) {
          result = iterator.next().value;
        }

        if (result) {
          while (svgContainer.firstChild) svgContainer.removeChild(svgContainer.firstChild);
          while (reference.firstChild) reference.removeChild(reference.firstChild);

          svgContainer.appendChild(result);
          svgContainer.classList.add('init');
          let timer = COUNTDOWN_LENGTH;
          const initBtn = document.createElement('button');
          initBtn.disabled = true;
          document.body.classList.add('timer');
          const vizTimer = () => {
            if (timer > 0) {
              initBtn.innerText = timer;
            } else {
              initBtn.innerText = 'I\'m ready to start labelling';
              initBtn.disabled = false;
            }
          };
          const setNextTimer = () => {
            setTimeout(() => {
              vizTimer();
              timer--;
              if (timer < 0) {
                initBtn.addEventListener('click', () => {
                  if (first) {
                    document.body.classList.add('unselected');
                    first = false;
                  }
                  svgContainer.classList.remove('init');
                  setupLabeller(name, svgContainer.querySelector('#svgContainer svg'));
                });
              } else {
                setNextTimer();
              }
            }, 1000);
          };
          svgContainer.appendChild(initBtn);
          vizTimer();
          timer--;
          setNextTimer();

          refSVG = result.cloneNode(true);
          refSVG.setAttribute('width', refSVG.getAttribute('data-width'));
          refSVG.setAttribute('height', refSVG.getAttribute('data-height'));
          reference.appendChild(refSVG);
          //svgContainer.innerHTML = src;
        } else {
          window.requestAnimationFrame(incrementalWork);
        }
      };

      window.requestAnimationFrame(incrementalWork);
    });
};

const radiusSelect = document.getElementById('radius');
[1,2,3,4,5,10,20,30].forEach(r => {
  const option = document.createElement('option');
  option.innerText = r;
  option.value = r;
  if (r == state.radius) option.selected = true;
  radiusSelect.appendChild(option);
});
radiusSelect.addEventListener('change', () => {
  state.setState({ radius: parseInt(radiusSelect.value) });
});

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
