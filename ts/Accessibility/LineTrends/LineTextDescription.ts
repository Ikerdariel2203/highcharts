/* *
 *
 *  (c) 2023 Highsoft AS
 *  Author: Øystein Moseng
 *
 *  Build automatic text descriptions for line charts.
 *
 *  License: www.highcharts.com/license
 *
 *  !!!!!!! SOURCE GETS TRANSPILED BY TYPESCRIPT. EDIT TS FILE ONLY. !!!!!!!
 *
 * */

'use strict';

import type Accessibility from '../Accessibility';
import type Series from '../../Core/Series/Series';
import type Point from '../../Core/Series/Point';

import AST from '../../Core/Renderer/HTML/AST.js';
import U from '../../Core/Utilities.js';
const {
    defined,
    uniqueKey
} = U;
import CU from '../Utils/ChartUtilities.js';
const {
    getAxisDescription,
    getAxisRangeDescription,
    getChartTitle
} = CU;
import HU from '../Utils/HTMLUtilities.js';
const {
    getHeadingTagNameForElement
} = HU;
import SL from './SimplifyLine.js';
const {
    preprocessSimplify,
    simplifyLine
} = SL;
import SD from '../Components/SeriesComponent/SeriesDescriber.js';
const {
    getPointXDescription,
    pointNumberToString
} = SD;


// Is a series a line series?
const isLineSeries = (s: Series): boolean =>
    ['line', 'spline', 'area', 'areaspline'].indexOf(s.type) > -1;

// Get Y value as string
const yFormat = (point?: Point): string => {
    if (!point) {
        return 'unknown value';
    }
    const numFormatted = defined(point.y) && pointNumberToString(
        point as Accessibility.PointComposition, point.y
    ) || 'unknown value';

    const series = point.series as Accessibility.SeriesComposition,
        chartOpts = series.chart.options,
        a11yPointOpts = chartOpts.accessibility.point || {},
        seriesA11yPointOpts = series.options.accessibility &&
            series.options.accessibility.point || {},
        tooltipOptions = series.tooltipOptions || {},
        valuePrefix = seriesA11yPointOpts.valuePrefix ||
            a11yPointOpts.valuePrefix ||
            tooltipOptions.valuePrefix ||
            '',
        valueSuffix = seriesA11yPointOpts.valueSuffix ||
            a11yPointOpts.valueSuffix ||
            tooltipOptions.valueSuffix ||
            '';

    return `${valuePrefix}${numFormatted}${valueSuffix}`;
};

// Get the average Y value at X from a line.
const getYAverageAtX = (line: Point[], x: number): number|null => {
    let prev = -1,
        next = -1,
        i = line.length;
    while (i--) {
        const lineX = line[i].x,
            lineY = line[i].y;
        if (defined(lineY)) {
            next = prev;
            prev = i;
            if (lineX === x) {
                return lineY;
            }
            if (lineX < x) {
                break;
            }
        }
    }
    if (prev < 0) {
        return line[0].y ?? null;
    }
    if (next < 0) {
        return line[prev].y as number;
    }
    return (
        (line[prev].y as number) + (line[next].y as number)
    ) / 2;
};


/**
 * Get chart title + subtitle description
 * @private
 */
function getTitleAndSubtitle(
    chart: Accessibility.ChartComposition, headingLevel: number
): string {
    const subtitle = chart.accessibility && chart.accessibility.components
        .infoRegions.getSubtitleText() || '';
    let html = `<h${headingLevel}>${getChartTitle(chart)}</h${headingLevel}>`;
    if (subtitle) {
        html += `<p>${subtitle}</p>`;
    }
    return html;
}


/**
 * Get chart type desc & series desc
 * @private
 */
function getTypeAndSeriesDesc(chart: Accessibility.ChartComposition): string {
    const lineSeries = chart.series.filter(isLineSeries),
        names = lineSeries.map((s): string => s.name),
        numLines = lineSeries.length,
        comboChart = chart.series.length > numLines,
        singleAxis = chart.yAxis.length + chart.xAxis.length < 3,
        xAxis = chart.xAxis[0];

    if (numLines < 1) {
        return '';
    }

    let desc = `${comboChart ? 'Combination' : 'Line'} chart with ${numLines} ${
        comboChart ? 'line series' :
            numLines > 1 ? 'lines' : 'line'
    }`;

    if (singleAxis) {
        const yAxisName = getAxisDescription(chart.yAxis[0]),
            xAxisName = getAxisDescription(xAxis);
        if (numLines > 1) {
            desc += `. The chart compares ${yAxisName} ${xAxis.dateTime ? 'over' : 'for'} ${xAxisName} for `;
        } else {
            desc += `. The chart shows ${yAxisName} ${xAxis.dateTime ? 'over' : 'for'} ${xAxisName}`;
        }
    } else {
        desc += ', showing ';
    }

    if (numLines > 1) {
        desc += names[0];
    }
    if (numLines === 2) {
        desc += ` and ${names[1]}`;
    } else if (numLines === 3) {
        desc += `, ${names[1]} and ${names[2]}`;
    } else if (numLines > 3) {
        desc += `, ${names[1]}, ${names[2]}, and more`;
    }
    desc += '.';

    return desc;
}


/**
 * Describe axis range and num points for a single axis chart.
 * If the chart has multiple axes, return empty string.
 * @private
 */
function getSingleAxisDescription(
    chart: Accessibility.ChartComposition
): string {
    const lineSeries = chart.series.filter(isLineSeries),
        numTotalDataPoints = lineSeries.reduce((acc, cur): number =>
            acc + cur.points.length, 0),
        xAxis = lineSeries[0] && lineSeries[0].xAxis;
    return xAxis && chart.xAxis.length + chart.yAxis.length < 3 ?
        `${getAxisRangeDescription(xAxis)} The chart has ${
            numTotalDataPoints
        } data points in total${lineSeries.length > 1 ? ' across all lines' : ''}.` :
        '';
}


/**
 * Get a short overall trend.
 * @private
 */
function getOverallTrend(simplifiedSeries: Point[][]): string {
    let maxTrendIx = -1,
        maxTrend = -Infinity,
        maxEndvalIx = -1,
        maxEndval = -Infinity;

    // Get increase/decrease in % from first point to last for each series
    const trend = simplifiedSeries.map((points, ix): number|null => {
        const first = points[0].y,
            last = points[points.length - 1].y;
        if (!defined(first) || !defined(last)) {
            return null;
        }
        const trend = (last - first) / first * 100;
        if (trend > maxTrend) {
            maxTrend = trend;
            maxTrendIx = ix;
        }
        if (last > maxEndval) {
            maxEndval = last;
            maxEndvalIx = ix;
        }
        return trend;
    });

    if (!trend.length) {
        return '';
    }

    // One series in the chart
    if (trend.length === 1) {
        if (trend[0] === null) {
            return '';
        }
        const line = simplifiedSeries[0],
            name = line[0].series.name,
            firstPoint = yFormat(line[0]),
            lastPoint = yFormat(line[line.length - 1]);
        if (trend[0] === 0) {
            return `${name} starts at ${firstPoint}, and ends at the same value.`;
        }
        const up = trend[0] > 0,
            pct = Math.round(trend[0]),
            slightThreshold = 2;
        return `${name} starts at ${firstPoint}, and ${
            up ? 'increases' : 'decreases'
        } ${
            pct < slightThreshold ? 'slightly ' : ''
        } overall, ending at ${lastPoint}.`;
    }

    // Multiple series
    let desc = '';
    const higher = trend.filter((t): boolean => !!t && t > 0).length,
        lower = trend.filter((t): boolean => !!t && t < 0).length;
    if ((higher < 1 || lower < 1) && higher + lower > 1) {
        desc += `All lines end ${lower < 1 ? 'higher' : 'lower'} than they started. `;
    }
    if (maxTrendIx > -1) {
        const highestPct = trend[maxTrendIx],
            steepestLine = simplifiedSeries[maxTrendIx],
            first = yFormat(steepestLine[0]),
            last = yFormat(steepestLine[steepestLine.length - 1]);
        if (highestPct !== null) {
            desc += `Overall, ${steepestLine[0].series.name} had the most significant ${
                highestPct > 0 ? 'increase' : 'decrease'
            } compared to where it started, starting at ${first}, and ending at ${last}.`;
        }
    }
    if (maxEndvalIx > -1) {
        const isSameAsHighestTrend = maxEndvalIx === maxTrendIx,
            highestLine = simplifiedSeries[maxEndvalIx];
        desc += ` ${highestLine[0].series.name}${
            isSameAsHighestTrend ? ' also' : ''
        } ended the highest overall`;
        if (!isSameAsHighestTrend) {
            desc += `, at ${yFormat(highestLine[highestLine.length - 1])}`;
        }
        desc += '.';
    }

    // Overall lower or higher?
    simplifiedSeries.forEach((simplifiedPoints): void => {
        let i = simplifiedPoints.length,
            isHighest = 2,
            isLowest = 2;

        while (i-- && (isHighest || isLowest)) {
            const thisY = simplifiedPoints[i].y;
            if (!defined(thisY)) {
                continue;
            }
            let j = simplifiedSeries.length;
            while (j-- && (isHighest || isLowest)) {
                const y = getYAverageAtX(
                    simplifiedSeries[j], simplifiedPoints[i].x
                );
                if (simplifiedSeries[j] !== simplifiedPoints && defined(y)) {
                    isHighest -= thisY > y ? 0 : 1;
                    isLowest -= thisY < y ? 0 : 1;
                }
            }
        }
        if (isHighest > 0 || isLowest > 0) {
            const name = simplifiedPoints[0].series.name;
            desc += ` ${name} trends overall ${isHighest > 0 ? 'higher' : 'lower'} than the other lines.`;
        }
    });

    return desc;
}


/**
 * Get min/max values for a line.
 * @private
 */
function getMinMaxValueSingle(line: Point[], min: boolean): string {
    const series = line[0] && line[0].series,
        val = series && (min ? series.dataMin : series.dataMax);
    if (!defined(val)) {
        return 'unknown value';
    }
    const points = line.filter(
        (p): boolean => defined(p.y) && p.y.toFixed(10) === val.toFixed(10)
    );
    if (points.length > 1) {
        return `${yFormat(points[0])}, happens at:<ul>${
            points.reduce((acc, cur): string =>
                `${acc}<li>${
                    getPointXDescription(cur as Accessibility.PointComposition)
                }</li>`, '')
        }</ul>`;
    }
    if (points.length > 0) {
        return `${yFormat(points[0])}, at ${
            getPointXDescription(points[0] as Accessibility.PointComposition)}`;
    }
    return 'unknown value';
}


/**
 * Get min/max values for set of line series.
 * @private
 */
function getMinMaxMultiple(
    series: Series[],
    simplifiedPoints: Point[][],
    min: boolean,
    headingLevel: number
): string {
    const val = (series?: Series): number => (min ?
        series && series.dataMin || Infinity :
        series && series.dataMax || -Infinity
    );
    return `<h${headingLevel}>${
        min ? 'Minimum' : 'Maximum'
    } values are:</h${headingLevel}><ul>${
        simplifiedPoints.slice()
            .sort((a, b): number => (min ?
                val(a[0] && a[0].series) - val(b[0] && b[0].series) :
                val(b[0] && b[0].series) - val(a[0] && a[0].series)
            ))
            .map((s, ix): string => {
                if (s[0]) {
                    return `<li>${s[0].series.name}: ${getMinMaxValueSingle(s, min)}</li>`;
                }
                return `<li>${series[ix].name}: No data</li>`;
            }).join(' ')
    }</ul>`;
}


/**
 * Describe the trend of a line.
 * @private
 */
function describeTrend(
    series: Accessibility.SeriesComposition,
    simplifiedPoints: Point[],
    short: boolean
): string {
    const len = simplifiedPoints.length,
        firstPoint = simplifiedPoints[0],
        name = series.name;

    if (!firstPoint) {
        return `${name} has no data in this period.`;
    }

    const lastPoint = simplifiedPoints[len - 1],
        x = (i: number): string => getPointXDescription(
            simplifiedPoints[i] as Accessibility.PointComposition),
        y = (i: number): string => yFormat(simplifiedPoints[i]);
    let desc = `${name} starts at ${y(0)}, at ${x(0)}`,
        prevY = firstPoint.y;

    if (!defined(prevY)) {
        return `${name}: Unknown trend.`;
    }

    // Shortened trend description
    if (short) {
        desc += '. From there it ';
        let riseAmount = 0,
            dropAmount = 0;
        for (let i = 1; i < simplifiedPoints.length; ++i) {
            const prev = simplifiedPoints[i - 1],
                cur = simplifiedPoints[i];
            if (!defined(prev.y) || !defined(cur.y)) {
                continue;
            }
            const diff = cur.y - prev.y;
            if (diff > 0) {
                riseAmount += diff;
            } else {
                dropAmount -= diff;
            }
        }
        const ratio = dropAmount === 0 ? Infinity : riseAmount / dropAmount,
            ratioLimit = (n: number): boolean =>
                (ratio > 1 ? ratio < ratio * n : ratio > ratio / n);
        if (riseAmount - dropAmount === 0 || ratio > 0.95 && ratio < 1.05) {
            desc += riseAmount > 0 ? 'rises and drops' : 'stays flat';
        } else {
            const [verb, nonverb] = ratio > 1 ?
                ['rises', 'drops'] : ['drops', 'rises'];
            desc += ratioLimit(1.5) ? `${verb} and ${nonverb}, but overall ${verb}` :
                ratioLimit(3) ? `overall ${verb}` :
                    ratioLimit(10) ? `mostly ${verb}` : verb;
        }
        desc += `. It ends at ${y(len - 1)} at ${x(len - 1)}.`;

    } else {

        // Not short, describe each movement, and put in ordered list
        desc = `<ul><li>${desc}`;
        let prevPlotY,
            prevPlotX;
        for (let i = 1; i < len; ++i) {
            const currentY = simplifiedPoints[i].y,
                currentPlotY = simplifiedPoints[i].plotY,
                currentPlotX = simplifiedPoints[i].plotX;
            if (!defined(currentY)) {
                continue;
            }
            const final = i === len - 1,
                dY = currentY - (prevY as number);
            let adverb = '';
            if (
                defined(currentPlotX) && defined(currentPlotY) &&
                defined(prevPlotX) && defined(prevPlotY)
            ) {
                const slope = Math.abs((currentPlotY - prevPlotY) /
                    (currentPlotX - prevPlotX));
                adverb = slope > 1 ? 'sharply ' :
                    slope < 0.2 ? 'gradually ' : '';
            }
            desc += `.</li><li>Then ${final ? 'finally ' : ''}${
                dY === 0 ? 'stays flat at' :
                    `${dY > 0 ? 'rises' : 'drops'} ${adverb}to`
            } ${y(i)} at ${x(i)}`;
            prevY = currentY;
            prevPlotX = currentPlotX;
            prevPlotY = currentPlotY;
        }

        const overallTrend = defined(firstPoint.y) && defined(lastPoint.y) ?
            lastPoint.y - firstPoint.y : null;
        if (overallTrend !== null) {
            desc += `, which is ${
                overallTrend === 0 ? 'at the value' :
                    overallTrend > 0 ? 'higher than' : 'lower than'
            } where it started`;
        }
        desc += '.</li></ul>';
    }

    return `${desc}`;
}


/**
 * Get min and max description for a single line.
 * @private
 */
function getMinMaxSingle(line: Point[]): string {
    return `Overall, the maximum value is ${
        getMinMaxValueSingle(line, false)
    }. The minimum is ${
        getMinMaxValueSingle(line, true)
    }.`;
}


/**
 * Get trend description for multiple lines.
 * @private
 */
function getMultilineTrends(
    chart: Accessibility.ChartComposition, simplifiedPoints: Point[][]
): string {
    return `Overall trends for each line:<ul>${
        simplifiedPoints.map((p, ix): string =>
            `<li>${describeTrend(chart.series[ix], p, true)}</li>`
        ).join(' ')
    }</ul>`;
}


/**
 * Inject the range selector for the trend description.
 * @private
 */
function addTrendRangeSelector(
    chart: Accessibility.ChartComposition,
    containerId: string,
    onRangeUpdate: Function
): void {
    const container = document.getElementById(containerId),
        startEl = document.createElement('input'),
        endEl = document.createElement('input'),
        startLabel = document.createElement('label'),
        endLabel = document.createElement('label'),
        explanation = document.createElement('p'),
        resetButton = document.createElement('button'),
        xAxis = chart.xAxis[0],
        xMin = xAxis.dataMin,
        xMax = xAxis.dataMax,
        day = 1000 * 60 * 60 * 24;

    if (!container || !defined(xMin) || !defined(xMax)) {
        return;
    }

    if (xAxis.dateTime) {
        const xRange = xMax - xMin;
        if (xRange > day * 3) {
            startEl.type = endEl.type = 'date';
            startEl.value = startEl.min = endEl.min = new Date(xMin)
                .toISOString().split('T')[0];
            endEl.value = startEl.max = endEl.max = new Date(xMax)
                .toISOString().split('T')[0];
        } else if (xRange > day) {
            startEl.type = endEl.type = 'datetime-local';
            startEl.value = startEl.min = endEl.min = new Date(xMin)
                .toISOString().split('Z')[0];
            endEl.value = startEl.max = endEl.max = new Date(xMax)
                .toISOString().split('Z')[0];
        } else {
            startEl.type = endEl.type = 'time';
            startEl.step = endEl.step = '1'; // seconds
            startEl.value = startEl.min = endEl.min = new Date(xMin)
                .toISOString().substring(11, 19);
            endEl.value = startEl.max = endEl.max = new Date(xMax)
                .toISOString().substring(11, 19);
        }
    } else {
        startEl.value = startEl.min = endEl.min = '' + xMin;
        endEl.value = startEl.max = endEl.max = '' + xMax;
    }

    const updateChartRange = (): void => {
        xAxis.setExtremes(
            startEl.valueAsNumber,
            endEl.valueAsNumber
        );
        onRangeUpdate();
    };

    resetButton.onclick = (): void => {
        startEl.value = startEl.min;
        endEl.value = endEl.max;
        updateChartRange();
    };

    startEl.onchange = endEl.onchange = updateChartRange;

    explanation.textContent = 'Select range to inspect for the details.' +
        ' This also sets the range for the interactive chart.';
    startLabel.textContent = 'Start';
    endLabel.textContent = 'End';
    resetButton.textContent = 'Reset';
    startLabel.appendChild(startEl);
    endLabel.appendChild(endEl);
    container.appendChild(explanation);
    container.appendChild(startLabel);
    container.appendChild(endLabel);
    container.appendChild(resetButton);
}


/**
 * Build and add a text description for a line chart.
 * @private
 */
function addLineChartTextDescription(
    chart: Accessibility.ChartComposition
): void {
    let html = '';
    const rootHLevel = parseInt(
            getHeadingTagNameForElement(chart.renderTo)[1] || '1', 10
        ),
        h2 = 'h' + (rootHLevel + 1),
        h3 = 'h' + (rootHLevel + 2),
        infoRegions = chart.accessibility &&
            chart.accessibility.components.infoRegions,
        add = (content?: string, wrapTag?: string): string => (
            html += content ?
                (wrapTag ? `<${wrapTag}>` : '') + content +
                (wrapTag ? `</${wrapTag}>` : '') :
                ''
        );

    const preprocessedSeries = chart.series.filter(isLineSeries)
            .map((s): Point[] => preprocessSimplify(s.points)),
        simplifiedSeries7p = preprocessedSeries
            .map((ps): Point[] => simplifyLine(ps, 7));

    add(getTitleAndSubtitle(chart, rootHLevel));
    add(infoRegions && infoRegions.getLongdescText(), 'p');
    add(getTypeAndSeriesDesc(chart), 'p');
    add(getSingleAxisDescription(chart), 'p');
    add(getOverallTrend(simplifiedSeries7p), 'p');

    add('Details', h2);

    // Placeholders for range selector & details for trend
    const rangeSelectorId = uniqueKey(),
        detailsId = uniqueKey();
    html += `<div id="${rangeSelectorId}" class="highcharts-trend-range-container"></div>` +
        `<div id="${detailsId}" class="highcharts-trend-detail-container"></div>`;

    const el = document.createElement('div');
    el.className = 'highcharts-line-description';
    chart.renderTo.parentNode.insertBefore(el, chart.renderTo);
    AST.setElementHTML(el, html);

    const updateDetails = (): void => {
        const detailsEl = document.getElementById(detailsId);
        if (!detailsEl) {
            return;
        }
        html = '';

        // Reset series detail
        if ((chart as unknown as Record<string, Function|undefined>)._resetTrendDetail) {
            (chart as unknown as Record<string, Function>)._resetTrendDetail(true);
            chart.redraw();
        }

        if (chart.xAxis.length + chart.yAxis.length > 2) {
            add('Axes', h3);
            const axesDesc = infoRegions && infoRegions.getAxesDescription();
            add(axesDesc && axesDesc.xAxis, 'p');
            add(axesDesc && axesDesc.yAxis, 'p');
        }

        const lineSeries = chart.series.filter(isLineSeries),
            preprocessedSeries = lineSeries.map(
                (s): Point[] => preprocessSimplify(
                    s.points.filter((p): boolean => !!p.isInside)
                )),
            numLineSeries = lineSeries.length;

        if (numLineSeries < 40 && numLineSeries) {
            const simplifiedSeries7p = preprocessedSeries
                .map((ps): Point[] => simplifyLine(ps, 7));

            if (numLineSeries === 1) {
                add('Major points of change', h3);
                add(describeTrend(
                    lineSeries[0], simplifiedSeries7p[0], false
                ), 'p');
                add(getMinMaxSingle(preprocessedSeries[0]), 'p');
            } else {
                add('Trends', h3);
                add(getMultilineTrends(chart, simplifiedSeries7p), 'p');
            }

            // Separate min/max section for multiline
            if (numLineSeries > 1) {
                add('Min and max', h3);
                add(getMinMaxMultiple(
                    lineSeries, preprocessedSeries, true, rootHLevel + 3
                ), 'p');
                add(getMinMaxMultiple(
                    lineSeries, preprocessedSeries, false, rootHLevel + 3
                ), 'p');
            }
        }

        AST.setElementHTML(detailsEl, html);

        setTimeout((): void => chart.accessibility &&
            chart.accessibility.components.infoRegions
                .announcer.announce('Range updated'), 1000);
    };

    addTrendRangeSelector(chart, rangeSelectorId, updateDetails);
    updateDetails();
}


/* *
 *
 *  Default Export
 *
 * */

export default addLineChartTextDescription;