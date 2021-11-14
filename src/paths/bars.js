import { abs, min, max, inf, ifNull, EMPTY_OBJ } from '../utils';
import { orient, rectV, rectH, BAND_CLIP_FILL, BAND_CLIP_STROKE } from './utils';
import { pxRatio } from '../dom';

export function bars(opts) {
	opts = opts || EMPTY_OBJ;
	const size = ifNull(opts.size, [0.6, inf, 1]);
	const align = opts.align || 0;
	const extraGap = (opts.gap || 0) * pxRatio;

	const radius = ifNull(opts.radius, 0) * pxRatio;

	const gapFactor = 1 - size[0];
	const maxWidth  = ifNull(size[1], inf) * pxRatio;
	const minWidth  = ifNull(size[2], 1) * pxRatio;

	const disp = opts.disp;
	const _each = ifNull(opts.each, _ => {});

	return (u, seriesIdx, idx0, idx1) => {
		return orient(u, seriesIdx, (series, dataX, dataY, scaleX, scaleY, valToPosX, valToPosY, xOff, yOff, xDim, yDim) => {
			let pxRound = series.pxRound;

			const _dirX = scaleX.dir * (scaleX.ori == 0 ? 1 : -1);
			const _dirY = scaleY.dir * (scaleY.ori == 1 ? 1 : -1);

			let rect = scaleX.ori == 0 ? rectH : rectV;

			let each = scaleX.ori == 0 ? _each : (u, seriesIdx, i, top, lft, hgt, wid) => {
				_each(u, seriesIdx, i, lft, top, wid, hgt);
			};

			let fillToY = series.fillTo(u, seriesIdx, series.min, series.max);

			let y0Pos = valToPosY(fillToY, scaleY, yDim, yOff);

			let xShift, barWid;

			let strokeWidth = pxRound(series.width * pxRatio);

			let multiPath = false;

			let fillColors = null;
			let fillPaths = null;
			let strokeColors = null;
			let strokePaths = null;

			if (disp != null) {
				if (disp.fill != null && disp.stroke != null) {
					multiPath = true;

					fillColors = disp.fill.values(u, seriesIdx, idx0, idx1);
					fillPaths = new Map();
					(new Set(fillColors)).forEach(color => {
						if (color != null)
							fillPaths.set(color, new Path2D());
					});

					strokeColors = disp.stroke.values(u, seriesIdx, idx0, idx1);
					strokePaths = new Map();
					(new Set(strokeColors)).forEach(color => {
						if (color != null)
							strokePaths.set(color, new Path2D());
					});
				}

				dataX = disp.x0.values(u, seriesIdx, idx0, idx1);

				if (disp.x0.unit == 2)
					dataX = dataX.map(pct => u.posToVal(xOff + pct * xDim, scaleX.key, true));

				// assumes uniform sizes, for now
				let sizes = disp.size.values(u, seriesIdx, idx0, idx1);

				if (disp.size.unit == 2)
					barWid = sizes[0] * xDim;
				else
					barWid = valToPosX(sizes[0], scaleX, xDim, xOff) - valToPosX(0, scaleX, xDim, xOff); // assumes linear scale (delta from 0)

				barWid = pxRound(barWid - strokeWidth);

				xShift = (_dirX == 1 ? -strokeWidth / 2 : barWid + strokeWidth / 2);
			}
			else {
				let colWid = xDim;

				if (dataX.length > 1) {
					// prior index with non-undefined y data
					let prevIdx = null;

					// scan full dataset for smallest adjacent delta
					// will not work properly for non-linear x scales, since does not do expensive valToPosX calcs till end
					for (let i = 0, minDelta = Infinity; i < dataX.length; i++) {
						if (dataY[i] !== undefined) {
							if (prevIdx != null) {
								let delta = abs(dataX[i] - dataX[prevIdx]);

								if (delta < minDelta) {
									minDelta = delta;
									colWid = abs(valToPosX(dataX[i], scaleX, xDim, xOff) - valToPosX(dataX[prevIdx], scaleX, xDim, xOff));
								}
							}

							prevIdx = i;
						}
					}
				}

				let gapWid = colWid * gapFactor;

				barWid = pxRound(min(maxWidth, max(minWidth, colWid - gapWid)) - strokeWidth - extraGap);

				xShift = (align == 0 ? barWid / 2 : align == _dirX ? 0 : barWid) - align * _dirX * extraGap / 2;
			}

			const _paths = {stroke: null, fill: null, clip: null, band: null, gaps: null, flags: BAND_CLIP_FILL | BAND_CLIP_STROKE};  // disp, geom

			const hasBands = u.bands.length > 0;
			let yLimit;

			if (hasBands) {
				// ADDL OPT: only create band clips for series that are band lower edges
				// if (b.series[1] == i && _paths.band == null)
				_paths.band = new Path2D();
				yLimit = pxRound(valToPosY(scaleY.max, scaleY, yDim, yOff));
			}

			const stroke = multiPath ? null : new Path2D();
			const band = _paths.band;

			for (let i = _dirX == 1 ? idx0 : idx1; i >= idx0 && i <= idx1; i += _dirX) {
				let yVal = dataY[i];

			/*
				// interpolate upwards band clips
				if (yVal == null) {
				//	if (hasBands)
				//		yVal = costlyLerp(i, idx0, idx1, _dirX, dataY);
				//	else
						continue;
				}
			*/

				let xVal = scaleX.distr != 2 || disp != null ? dataX[i] : i;

				// TODO: all xPos can be pre-computed once for all series in aligned set
				let xPos = valToPosX(xVal, scaleX, xDim, xOff);
				let yPos = valToPosY(yVal, scaleY, yDim, yOff);

				let lft = pxRound(xPos - xShift);
				let btm = pxRound(max(yPos, y0Pos));
				let top = pxRound(min(yPos, y0Pos));
				let barHgt = btm - top;

				if (dataY[i] != null) {
					if (multiPath) {
						if (strokeWidth > 0 && strokeColors[i] != null)
							rect(strokePaths.get(strokeColors[i]), lft, top, barWid, barHgt, radius * barWid);

						if (fillColors[i] != null)
							rect(fillPaths.get(fillColors[i]), lft, top, barWid, barHgt, radius * barWid);
					}
					else
						rect(stroke, lft, top, barWid, barHgt, radius * barWid);

					each(u, seriesIdx, i,
						lft    - strokeWidth / 2,
						top    - strokeWidth / 2,
						barWid + strokeWidth,
						barHgt + strokeWidth,
					);
				}

				if (hasBands) {
					if (_dirY == 1) {
						btm = top;
						top = yLimit;
					}
					else {
						top = btm;
						btm = yLimit;
					}

					barHgt = btm - top;

					rect(band, lft - strokeWidth / 2, top + strokeWidth / 2, barWid + strokeWidth, barHgt - strokeWidth, 0);
				}
			}

			if (strokeWidth > 0)
				_paths.stroke = multiPath ? strokePaths : stroke;

			_paths.fill = multiPath ? fillPaths : stroke;

			return _paths;
		});
	};
}