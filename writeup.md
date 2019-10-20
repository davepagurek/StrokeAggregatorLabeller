% Stroke Aggregator Labelling
---
geometry: margin=2.5cm
---

# 1. Labelling Task

Group strokes together that you feel were intended to depict the same intended curve.

# 2. Example

![](img/simple.png)

Each group of strokes represents the same same smooth curve. If it looks like two curves come together at a sharp intersection, they should be separate groups. In areas of the sketch where the strokes are used for shading, whole patches of shading should be grouped together independently from the non-shading lines in the drawing.

# 3. Using the Labeller

The labeller works by making a **selection** and then performing an **operation** on it.

To select a group of curves, click on any curve in the group. The whole group will turn black to indicate that it is selected.

![](img/select.png)

Once there is a selection, there are three operations that the labeller can perform:

- **Merge**, for combining two groups of strokes into one
- **Split**, for removing some curves of one group and turning them into their own group
  - **Break**, a subset of split mode, for splitting a single curve into two curves that can then be independently grouped

At any point, hitting the escape key cancels the current operation and deselects the currently selected group. The undo and redo buttons or Ctrl-Z and Ctrl-Y keyboard shortcuts can be used to step back and forward through the history of operations.

## 3.1 Merge Operation

When a group is selected, pressing the 1 key enters merge mode. In this mode, every time you click, every group with a curve under the brush gets added to the selected group. The radius of the brush can be adjusted in the top bar of the labeller.

![](img/merge.png)

## 3.2 Split Operation

When a group is selected, pressing the 2 key enters split mode. You then need to make a **sub-selection** of curves in the selected group which you intend to split off into its own group. Every time you click, all the curves under the brush toggle whether or not they are sub-selected. The radius of the brush can be adjusted in the top bar of the labeller. The sub-selected curves appear pink.

### 3.2.1 Splitting Whole Curves

With a sub-selection made, pressing the 3 key finalizes the split and turns the sub-selection into its own group.

![](img/split.png)

### 3.2.2 Breaking a Curve

If a sub-selection contains only one curve, then pressing the 4 key allows you to break the curve into two curves. A red dot appears on the curve showing where the break will happen. Moving the mouse left and right changes the position of the break point. Pressing the 4 key a second time confirms the break, creating two curves out of the sub-selection, each one in its own new group.

![](img/break.png)

# 4. Additional Examples

![](img/bunny.png)

![](img/house.png)
