#!/usr/bin/env python3

import os, sys
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.path import Path
import matplotlib.patches as patches

import shapely.geometry
import descartes

# A palette with optimally distinct colors
# Based on https://www.tableau.com/about/blog/2016/7/colors-upgrade-tableau-10-56782
palette = ['#4e79a7', '#f28e2b', '#cc3333', '#66cccc', '#59a14f', \
'#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac']

# A palette with optimally distinct colors
# http://tools.medialab.sciences-po.fr/iwanthue/
palette_large = ['#c583d9', '#9de993', '#ad5ba7', '#58f2c3', '#c94e76', \
'#57b870', '#d271bb', '#3d8e43', '#f375a0', '#00d4db', '#d55969', \
'#64e4ff', '#e68e54', '#54aeff', '#eed973', '#008bd4', '#fdb968', \
'#6f73bc', '#bee481', '#8f6aaf', '#8bb658', '#bbabff', '#658424', \
'#f1b9ff', '#989c37', '#bb568c', '#cfe395', '#c45372', '#008c6f', \
'#ff94af', '#488656', '#ffc0e1', '#6c8139', '#a9d0ff', '#a98c2c', \
'#0294bb', '#d7b555', '#4a7ea6', '#ffa372', '#96ddff', '#b06735', \
'#bae0f9', '#b76246', '#b0e4e9', '#ff9b9c', '#378673', '#ffa98e', \
'#6a79a2', '#ffcca9', '#53827e', '#ffcdcf', '#648168', '#e7d3fa', \
'#93744c', '#cde1bc', '#9b6a8a', '#efd8b1', '#928098', '#7c7b5c', '#a6686c']

border_offset = 5

# https://stackoverflow.com/questions/15670973/matplotlib-path-linewidth-connected-to-figure-zoom
def draw_scap(capture, width, height, show_text=False):
	# Construct paths
	paths = []
	colors = []
	for stroke in capture:
		verts = [(p[0] + border_offset, height-p[1] + border_offset) for p in stroke]

		paths.append(verts)
		if stroke.group_ind >= 0:
			colors.append(palette_large[stroke.group_ind % len(palette_large)])
		else:
			colors.append('#b3b3b330')

	paths = [shapely.geometry.LineString(p) for p in paths]
	poly = [p.buffer(capture[0].thickness/2) for p in paths]
	patches = [descartes.PolygonPatch(p, fc=colors[i], ec=colors[i], zorder=0) for i, p in enumerate(poly)]

	fig = plt.figure(figsize=(width/80, height/80), dpi=80)

	# https://stackoverflow.com/questions/19306510/determine-matplotlib-axis-size-in-pixels/19306776
	ax = plt.Axes(fig, [0., 0., 1., 1.])
	ax.set_axis_off()
	fig.add_axes(ax)

	for i, patch in enumerate(patches):
		ax.add_artist(patch)

		if show_text:
			stroke = capture[i]
			if stroke.group_ind >= 0:
				p = list(stroke.points[0])
				p[0] += border_offset
				p[1] -= border_offset
				ax.annotate('{}'.format(stroke.stroke_ind), xy=(p[0], height - p[1]), xytext=(p[0] + 10, height - p[1] + 10),
					arrowprops=dict(facecolor='black', shrink=0.05, width=1, headwidth=3, headlength=4))

	ax.set_aspect('equal')
	ax.set_xlim(0, width + border_offset * 2)
	ax.set_ylim(0, height + border_offset * 2)

	return ax
