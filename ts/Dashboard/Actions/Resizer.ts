/* eslint-disable */
import type {
    HTMLDOMElement
} from '../../Core/Renderer/DOMElementType';
import type JSON from '../../Core/JSON';
import type Cell from '../Layout/Cell.js';
import type Serializable from '../Serializable';
import EditGlobals from '../EditMode/EditGlobals.js';
import GUIElement from '../Layout/GUIElement.js';

import U from '../../Core/Utilities.js';

const {
    merge,
    addEvent,
    css,
    createElement,
    fireEvent,
    removeEvent,
    pick
} = U;

import H from '../../Core/Globals.js';
import EditMode from '../EditMode/EditMode';

const {
    hasTouch
} = H;

/**
 * Class providing a resizing functionality.
 */
class Resizer {
    /* *
    *
    *  Static Properties
    *
    * */

    public static fromJSON(
        editMode: EditMode,
        json: Resizer.JSON
    ): Resizer|undefined {
        return new Resizer(editMode, json.options);
    }

    protected static readonly defaultOptions: Resizer.Options = {
        enabled: true,
        styles: {
            minWidth: 20,
            minHeight: 50
        },
        type: 'xy',
        snap: {
            width: 20,
            height: 20
        }
    };

    /* *
    *
    *  Constructors
    *
    * */

    /**
     * Constructor for the Resizer class.
     *
     * @param {EditMode} editMode
     * The parent editMode reference.
     *
     * @param {Resizer.Options} options
     * Options for the Resizer.
     */
    public constructor(
        editMode: EditMode,
        options?: Resizer.Options
    ) {
        this.editMode = editMode;
        this.options = merge(
            {},
            Resizer.defaultOptions,
            editMode.options.resize,
            options
        );

        this.currentCell = void 0; // consider naming for example currentCell
        this.isX = this.options.type.indexOf('x') > -1;
        this.isY = this.options.type.indexOf('y') > -1;
        this.isActive = false;
        this.startX = 0;
        this.tempSiblingsWidth = [];

        this.addSnaps(
            this.options
        );

        this.resizePointer = {
            isVisible: false,
            element: createElement(
                'div',
                { className: EditGlobals.classNames.resizePointer },
                {},
                editMode.dashboard.container
            )
        };

        this.isResizerDetectionActive = false;
        this.initEvents();
    }

    /* *
    *
    *  Properties
    *
    * */

    /**
     * The editMode reference.
     */
    public editMode: EditMode;

    /**
     * Resizer options.
     */
    public options: Resizer.Options;

    /**
     * Resized element reference.
     */
    public currentCell: Cell|undefined;
    
    /**
     * Dimension of current resizing (x or y).
     */
    public currentDimension: string|undefined;

    /**
     * Type of resizing.
     */
    public isX: boolean;

    /**
     * Type of resizing.
     */
    public isY: boolean;

    /**
     * Reference to right handler
     */
    public snapXR: HTMLDOMElement|undefined;

    /**
     * Reference to bottom handler
     */
    public snapYB: HTMLDOMElement|undefined;

    /**
     * Pending resizer flag
     */
    public isActive: boolean;

    /**
     * Pending context dection flag
     */
    public isResizerDetectionActive: boolean;

    /**
     * Reference to pointer of current resized element
     */
    public resizePointer: Resizer.ResizePointer;

    /**
     * Reference to start position of resizer
     */
    public startX: number;

    /**
     * Array of siblings which have auto-flex width and we need to apply static
     * width for resizing event. After resizing cells revert widths to auto.
     */
    public tempSiblingsWidth: Array<Cell>;

    /* *
     *
     *  Functions
     *
     * */

    /**
     * Method for initializing resizing events.
     */
    public initEvents(): void {
        const resizer = this;

        // Resizer events.
        addEvent(document, 'mousemove', resizer.onDetectContext.bind(resizer));
    }

    /**
     * Add Snap - create snaps and add events.
     *
     * @param {Resizer.Options} options
     * Reference to options of snaps
     *
     */
    public addSnaps(
        options: Resizer.Options
    ): void {
        const minWidth = options.styles.minWidth;
        const minHeight = options.styles.minHeight;
        const snapWidth = this.options.snap.width || 0;
        const snapHeight = this.options.snap.height || 0;
        const dashboardContainer = this.editMode.dashboard.container;

        // right snap
        this.snapXR = createElement(
            'div',
            {
                className: EditGlobals.classNames.resizeSnap + ' ' +
                    EditGlobals.classNames.resizeSnapX
            },
            {
                width: snapWidth + 'px',
                left: -9999 + 'px'
            },
            dashboardContainer
        );

        // bottom snap
        this.snapYB = createElement(
            'div',
            {
                className: EditGlobals.classNames.resizeSnap + ' ' +
                    EditGlobals.classNames.resizeSnapY
            },
            {
                height: snapHeight + 'px',
                top: -9999 + 'px',
                left: '0px'
            },
            dashboardContainer
        );

        this.addResizeEvents();

    }

    /**
     * Hide snaps
     *
     */
    public disableResizer(): void {

        this.isActive = false;
        this.currentDimension = void 0;
        this.currentCell = void 0;

        if (this.snapXR) {
            this.snapXR.style.left = '-9999px';
        }

        if (this.snapYB) {
            this.snapYB.style.left = '-9999px';
        }
    }
    /**
     * Update snap position.
     *
     * @param {PointerEvent} e
     * Mouse event.
     * 
     */
    public setSnapPositions(
        cell: Cell
    ): void {
        // set current cell
        this.currentCell = cell;

        // set position of snaps
        const cellOffsets = GUIElement.getOffsets(
            cell,
            this.editMode.dashboard.container
        );
        const left = cellOffsets.left || 0;
        const top = cellOffsets.top || 0;
        const { width, height } = GUIElement.getDimFromOffsets(cellOffsets);
        const snapWidth = (this.options.snap.width || 0);
        const snapHeight = (this.options.snap.height || 0);

        if (this.snapXR) {
            this.snapXR.style.left = (left + width - snapWidth) + 'px';
            this.snapXR.style.top = top + (
                height / 2
            ) - (snapHeight / 2) + 'px';
        }

        if (this.snapYB) {
            this.snapYB.style.top = (top + height - snapHeight) + 'px';
            this.snapYB.style.left = (
                left + (
                    width / 2
                ) - (snapWidth / 2)
            ) + 'px';
        }
    }

    /**
     * Method detecs siblings and auto-width applied by flex. The resizer
     * requires static widths for correct calculations, so we need to apply
     * temporary width on siblings.
     */
    public setTempWidthSiblings(): void {
        const currentCell = this.currentCell;
        const currentRwdMode = this.editMode.rwdMode;

        if (currentCell) {
            const cellOffsets = GUIElement.getOffsets(currentCell);
            const rowLevelInfo = currentCell.row.getRowLevelInfo(cellOffsets.top);
            const cellsSiblings = rowLevelInfo && rowLevelInfo.rowLevel.cells || [];
            let cellContainer;
            let cell;
            let optionsWidth;

            for (let i = 0, iEnd = cellsSiblings.length; i < iEnd; ++i) {
                cell = cellsSiblings[i];
                cellContainer = cellsSiblings[i].container;
                optionsWidth = pick(
                    cell.options.width,
                    ((cell.options.responsive || {})[currentRwdMode] || {}).width
                );

                if (
                    cell !== currentCell &&
                    cellContainer &&
                    !optionsWidth
                ) {
                    cellContainer.style.flex = (
                        '0 0 ' +
                        (cellContainer.offsetWidth + 'px')
                    );

                    this.tempSiblingsWidth.push(
                        cell
                    );

                    fireEvent(this.editMode.dashboard, 'cellResize', { cell: cell });

                }
            }
        }

    }

    /**
     * Revert widths to auto.
     */
    public revertSiblingsAutoWidth(): void {
        const tempSiblingsWidth = this.tempSiblingsWidth;
        let cellContainer;
        
        for (let i = 0, iEnd = tempSiblingsWidth.length; i < iEnd; ++i) {
            cellContainer = tempSiblingsWidth[i].container;

            if (cellContainer) {
                cellContainer.style.flex = ('1 1 0%');
            }
        }

        this.tempSiblingsWidth = [];
    }

    /**
     * Add mouse events to snaps 
     *
     */
    public addResizeEvents(): void {
        const resizer = this;
        let mouseDownSnapX,
            mouseDownSnapY,
            mouseMoveSnap,
            mouseUpSnap;

        resizer.mouseDownSnapX = mouseDownSnapX = function (
            e: PointerEvent
        ): void {
            resizer.isActive = true;
            resizer.currentDimension = 'x';
            resizer.deactivateResizerDetection();
            resizer.editMode.hideToolbars(['row', 'cell']);

            resizer.setTempWidthSiblings();

            resizer.startX = e.clientX;
        };

        resizer.mouseDownSnapY = mouseDownSnapY = function (
            e: PointerEvent
        ): void {
            resizer.isActive = true;
            resizer.currentDimension = 'y';
            resizer.deactivateResizerDetection();
            resizer.editMode.hideToolbars(['row', 'cell']);
        };

        resizer.mouseMoveSnap = mouseMoveSnap = function (
            e: PointerEvent
        ): void {
            if (resizer.isActive) {
                resizer.onMouseMove(
                    e as PointerEvent
                );
            }
        };

        resizer.mouseUpSnap = mouseUpSnap = function (
            e: PointerEvent
        ): void {
            if (resizer.isActive) {
                resizer.isActive = false;
                resizer.currentDimension = void 0;
                resizer.activateResizerDetection();
                resizer.editMode.showToolbars(
                    ['row', 'cell'],
                    resizer.currentCell
                );

                resizer.revertSiblingsAutoWidth();
            }
        };

        // Add mouse events
        addEvent(this.snapXR, 'mousedown', mouseDownSnapX);
        addEvent(this.snapYB, 'mousedown', mouseDownSnapY);

        addEvent(document, 'mousemove', mouseMoveSnap);
        addEvent(document, 'mouseup', mouseUpSnap);

        // Touch events
        // if (hasTouch) {
        //     addEvent(snapX, 'touchstart', mouseDownSnapX);
        //     addEvent(snapY, 'touchstart', mouseDownSnapY);

        //     if (!rowContainer.hcEvents.mousemove) {
        //         addEvent(rowContainer, 'touchmove', mouseMoveSnap);
        //         addEvent(rowContainer, 'touchend', mouseUpSnap);
        //     }
        // }
    }
    /**
     * General method used on resizing.
     *
     * @param {global.Event} e
     * A mouse event.
     *
     */
    public onMouseMove(
        e: PointerEvent
    ): void {
        const currentCell = this.currentCell as Resizer.ResizedCell;
        const cellContainer = currentCell && currentCell.container;
        const currentDimension = this.currentDimension;
        const sidebar = this.editMode.sidebar;
        const currentRwdMode = sidebar && sidebar.editMode.rwdMode;
        const cellRwd = (currentCell.options.responsive || {})[currentRwdMode || 'large'];

        if (
            currentCell &&
            cellContainer &&
            !((currentCell.row.layout.dashboard.editMode || {}).dragDrop || {}).isActive
        ) {
            const cellOffsets = GUIElement.getOffsets(currentCell);
            const { width: parentRowWidth } = GUIElement.getDimFromOffsets(
                GUIElement.getOffsets(currentCell.row)
            );
            // resize width
            if (currentDimension === 'x') {
                const newWidth = (
                    Math.min(e.clientX - cellOffsets.left, parentRowWidth) /
                    parentRowWidth
                ) * 100 + '%';

                currentCell.setSize(newWidth);
                currentCell.updateSize(newWidth, currentRwdMode);

                this.startX = e.clientX;
            }

            // resize height
            if (currentDimension === 'y') {
                cellContainer.style.height =
                    (
                        e.clientY - cellOffsets.top
                    ) + 'px';
            }
            // Call cellResize dashboard event.
            fireEvent(this.editMode.dashboard, 'cellResize', { cell: currentCell });
            fireEvent(currentCell.row, 'cellChange', { cell: currentCell, row: currentCell.row });

            this.setSnapPositions(currentCell);
        }
    }
    /**
     * Destroy resizer
     *
     * @param {Array<Row>} nestedRows
     * Reference to rows in the layout
     *
     */
    public destroy(): void {
        const snaps = ['snapXR', 'snapYB'];
        let snap;

        // unbind events
        removeEvent(document, 'mousemove');
        removeEvent(document, 'mouseup');

        for (let i = 0, iEnd = snaps.length; i < iEnd; ++i) {
            snap = (this as any)[snaps[i]];

            // unbind event
            removeEvent(snap, 'mousedown');

            // destroy snap
            snap.remove();
        };
    }
    /**
     * Converts the class instance to a class JSON.
     *
     * @return {Resizer.JSON}
     * Class JSON of this Resizer instance.
     */
    public toJSON(): Resizer.JSON {
        const options = this.options;

        return {
            $class: 'Dashboard.Action.Resizer',
            options: {
                enabled: options.enabled,
                styles: {
                    minWidth: options.styles.minWidth,
                    minHeight: options.styles.minHeight,
                },
                type: options.type,
                snap: {
                    width: options.snap.width,
                    height: options.snap.height
                }
            }
        };
    }

    /**
     * Activate resizer detection
     *
     */
    public activateResizerDetection(): void {
        this.isResizerDetectionActive = true;
    }

    /**
     * Deactivate resizer detection
     * 
     */
    public deactivateResizerDetection(): void {
        this.isResizerDetectionActive = false;
        this.hideResizePointer();
    }

    /**
     * Action called when context (cell or row) is detected
     *
     * @param {PointerEvent} e
     * Mouse event.
     * 
     */
    public onDetectContext(e: PointerEvent): void {
        const resizer = this,
            offset = 50; // TODO - add it from options.

        if (resizer.isResizerDetectionActive && this.currentCell) {
            const resizeCellContextOffsets = GUIElement.getOffsets(
                this.currentCell, resizer.editMode.dashboard.container);
            const { width, height } = GUIElement.getDimFromOffsets(resizeCellContextOffsets);

            resizer.showResizePointer(
                resizeCellContextOffsets.left, resizeCellContextOffsets.top, width, height
            );
        }
    }

    /**
     * Method for showing and positioning resize pointer.
     *
     * @param {number} left
     * Resize pointer left position.
     *
     * @param {number} top
     * Resize pointer top position.
     *
     * @param {number} width
     * Resize pointer width.
     *
     * @param {number} height
     * Resize pointer height.
     */
    private showResizePointer(
        left: number,
        top: number,
        width: number,
        height: number
    ): void {
        this.resizePointer.isVisible = true;
        css(this.resizePointer.element, {
            display: 'block',
            left: left + 'px',
            top: top + 'px',
            height: height + 'px',
            width: width + 'px'
        });
    }

    /**
     * Method for hiding resize pointer.
     */
    private hideResizePointer(): void {
        if (this.resizePointer.isVisible) {
            this.resizePointer.isVisible = false;
            this.resizePointer.element.style.display = 'none';
        }
    }
}
interface Resizer {
    mouseDownSnapX?: Function;
    mouseDownSnapY?: Function;
    mouseMoveSnap?: Function;
    mouseUpSnap?: Function;
}
namespace Resizer {
    export interface Options {
        enabled: boolean;
        type: string;
        snap: SnapOptions;
        styles: ElementStyles
    }
    export interface ResizedCell extends Cell {
        resizer?: Snap;
        // styles?: ElementStyles;
    }

    export interface ElementStyles {
        borderLeft?: number;
        borderRight?: number;
        borderTop?: number;
        borderBottom?: number;
        minWidth?: number;
        minHeight?: number;
    }
    export interface Snap {
        snapX?: HTMLDOMElement|undefined;
        snapY?: HTMLDOMElement|undefined;
    }

    export interface SnapOptions {
        width?: number;
        height?: number;
    }

    export interface HTMLDOMElementEvents extends HTMLDOMElement {
        hcEvents: Record<string, Array<Function>>;
    }

    export interface JSON extends Serializable.JSON<'Dashboard.Action.Resizer'> {
        options: JSONOptions;
    }

    export interface JSONOptions extends JSON.Object {
        enabled: boolean;
        styles: ElementStylesJSON;
        type: string;
        snap: SnapJSON;
    }
    export interface SnapJSON extends JSON.Object {
        width?: number;
        height?: number;
    }
    export interface ElementStylesJSON extends JSON.Object {
        borderLeft?: number;
        borderRight?: number;
        borderTop?: number;
        borderBottom?: number;
        minWidth?: number;
        minHeight?: number;
    }

    export interface ResizePointer {
        isVisible: boolean;
        element: HTMLDOMElement;
    }

    export interface CellSiblings {
        prev: Array<Cell>;
        next: Array<Cell>;
    }
}

export default Resizer;
