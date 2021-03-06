/*************************************************************
 *
 *  Copyright (c) 2017 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

/**
 * @fileoverview  Implements the abstract class for the CommonOutputJax
 *
 * @author dpvc@mathjax.org (Davide Cervone)
 */

import {AbstractOutputJax} from '../../core/OutputJax.js';
import {MathDocument} from '../../core/MathDocument.js';
import {MathItem, Metrics} from '../../core/MathItem.js';
import {MmlNode} from '../../core/MmlTree/MmlNode.js';
import {FontData, FontDataClass} from './FontData.js';
import {OptionList, separateOptions} from '../../util/Options.js';
import {CssStyles} from './CssStyles.js';
import {WrapperClass} from '../../core/Tree/Wrapper.js';
import {CommonWrapper, CommonWrapperClass} from './Wrapper.js';
import {CommonWrapperFactory} from './WrapperFactory.js';
import {percent} from '../../util/lengths.js';

/*****************************************************************/

/**
 * Maps linking a node to the test node it contains,
 *  and a map linking a node to the metrics within that node.
 */
export type MetricMap<N> = Map<N, Metrics>;
type MetricDomMap<N> = Map<N, N>;

/*****************************************************************/

/**
 *  The CommonOutputJax class on which the CHTML and SVG jax are built
 *
 * @template N  The HTMLElement node class
 * @template T  The Text node class
 * @template D  The Document class
 * @template W  The Wrapper class
 * @template F  The WrapperFactory class
 */
export abstract class CommonOutputJax<N, T, D,
                                      W extends CommonWrapper<any, any, any>,
                                      F extends CommonWrapperFactory<any, any, any>> extends
AbstractOutputJax<N, T, D> {

    public static NAME: string = 'Common';
    public static OPTIONS: OptionList = {
        ...AbstractOutputJax.OPTIONS,
        scale: 1,                      // Global scaling factor for all expressions
        mathmlSpacing: false,          // true for MathML spacing rules, false for TeX rules
        skipAttributes: {},            // RFDa and other attributes NOT to copy to the output
        exFactor: .5,                  // default size of ex in em units
        wrapperFactory: null,          // The wrapper factory to use
        font: null,                    // The FontData object to use
        cssStyles: null                // The CssStyles object to use
    };

    /**
     * Used for collecting styles needed for the output jax
     */
    public cssStyles: CssStyles;

    /**
     * The MathDocument for the math we find
     * and the MathItem currently being processed
     */
    public document: MathDocument<N, T, D>;
    public math: MathItem<N, T, D>;

    /**
     * The data for the font in use
     */
    public font: FontData;

    public factory: F;

    /**
     * A map from the nodes in the expression currently being processed to the
     * wrapper nodes for them (used by functions like core() to locate the wrappers
     * from the core nodes)
     */
    public nodeMap: Map<MmlNode, W>;

    /**
     * Nodes used to test for metric data
     */
    public testNodes: N;

    /*****************************************************************/

    /**
     * Get the WrapperFactory and connect it to this output jax
     * Get the cssStyle and font objects
     *
     * @param {OptionList} options         The configuration options
     * @param(FontDataClass} defaultFont  The default FontData constructor
     * @constructor
     */
    constructor(options: OptionList = null,
                defaultFactory: typeof CommonWrapperFactory = null,
                defaultFont: FontDataClass = null) {
        const [jaxOptions, fontOptions] = separateOptions(options, defaultFont.OPTIONS);
        super(jaxOptions);
        this.factory = this.options.wrapperFactory ||
            new defaultFactory<CommonOutputJax<N, T, D, W, F>, W, CommonWrapperClass<any, W, any>>();
        this.factory.jax = this;
        this.cssStyles = this.options.cssStyles || new CssStyles();
        this.font = this.options.font || new defaultFont(fontOptions);
    }

    /*****************************************************************/

    /**
     * Save the math document
     * Create the mjx-container node
     * Create the DOM output for the root MathML math node in the container
     * Return the container node
     *
     * @override
     */
    public typeset(math: MathItem<N, T, D>, html: MathDocument<N, T, D>) {
        this.setDocument(html);
        let node = this.createNode();
        this.toDOM(math, node, html);
        return node;
    }

    /**
     * @return {N}  The container DOM node for the typeset math
     */
    protected createNode() {
        const jax = (this.constructor as typeof CommonOutputJax).NAME;
        return this.html('mjx-container', {'class': 'MathJax', jax: jax});
    }

    /**
     * @param {N} node   The container whose scale is to be set
     */
    protected setScale(node: N) {
        const scale = this.math.metrics.scale * this.options.scale;
        if (scale !== 1) {
            this.adaptor.setStyle(node, 'fontSize', percent(scale));
        }
    }

    /**
     * Save the math document, if any, and the math item
     * Set the document where HTML nodes will be created via the adaptor
     * Recursively set the TeX classes for the nodes
     * Set the scaling for the DOM node
     * Create the nodeMap (maps MathML nodes to corresponding wrappers)
     * Create the HTML output for the root MathML node in the container
     * Clear the nodeMape
     * Execute the post-filters
     *
     * @param {MathItem} math      The math item to convert
     * @param {N} node             The contaier to place the result into
     * @param {MathDocument} html  The document containing the math
     */
    public toDOM(math: MathItem<N, T, D>, node: N, html: MathDocument<N, T, D> = null) {
        this.setDocument(html);
        this.math = math;
        math.root.setTeXclass(null);
        this.setScale(node);
        this.nodeMap = new Map<MmlNode, W>();
try {
        this.processMath(math.root, node);
} catch (e) {
    console.log(e.stack);
    throw e;
}
        this.nodeMap = null;
        this.executeFilters(this.postFilters, math, node);
    }

    /**
     * This is the actual typesetting function supplied by the subclass
     *
     * @param {MmlNode} math   The intenral MathML node of the root math element to process
     * @param {N} node         The container node where the math is to be typeset
     */
    protected abstract processMath(math: MmlNode, node: N): void;

    /*****************************************************************/

    /**
     * @param {MathItem} math      The MathItem to get the bounding box for
     * @param {MathDocument} html  The MathDocument for the math
     */
    public getBBox(math: MathItem<N, T, D>, html: MathDocument<N, T, D>) {
        this.setDocument(html);
        this.math = math;
        math.root.setTeXclass(null);
        this.nodeMap = new Map<MmlNode, W>();
        let bbox = this.factory.wrap(math.root).getBBox();
        this.nodeMap = null;
        return bbox;
    }

    /*****************************************************************/

    /**
     * @override
     */
    public getMetrics(html: MathDocument<N, T, D>) {
        this.setDocument(html);
        const adaptor = this.adaptor;
        const map = this.getMetricMap(html);
        for (const math of html.math) {
            const parent = adaptor.parent(math.start.node);
            const {em, ex, containerWidth, lineWidth, scale} = map.get(parent);
            math.setMetrics(em, ex, containerWidth, lineWidth, scale);
        }
    }

    /**
     * Get a MetricMap for the math list
     *
     * @param {MathDocument} html  The math document whose math list is to be processed.
     * @return {MetricMap}         The node-to-metrics map for all the containers that have math
     */
    protected getMetricMap(html: MathDocument<N, T, D>) {
        const adaptor = this.adaptor;
        const domMap = new Map() as MetricDomMap<N>;
        //
        // Add the test elements all at once (so only one reflow)
        //
        for (const math of html.math) {
            const parent = adaptor.parent(math.start.node);
            if (!domMap.has(parent)) {
                domMap.set(parent, this.getTestElement(parent));
            }
        }
        //
        // Measure the metrics for all the mapped elements
        //
        const map = new Map() as MetricMap<N>;
        for (const node of domMap.keys()) {
            map.set(node, this.measureMetrics(domMap.get(node)));
        }
        //
        // Remove the test elements
        //
        for (const node of domMap.values()) {
            adaptor.remove(node);
        }
        return map;
    }

    /**
     * @param {N} node    The container to add the test elements to
     * @return {N}        The test elements that were added
     */
    protected getTestElement(node: N) {
        const adaptor = this.adaptor;
        if (!this.testNodes) {
            this.testNodes = this.html('mjx-test', {style: {
                display:           'inline-block',
                'font-style':      'normal',
                'font-weight':     'normal',
                'font-size':       '100%',
                'font-size-adjust':'none',
                'text-indent':     0,
                'text-transform':  'none',
                'letter-spacing':  'normal',
                'word-spacing':    'normal',
                overflow:          'hidden',
                height:            '1px'
            }}, [
                this.html('mjx-ex-box', {style: {
                    position: 'absolute',
                    overflow: 'hidden',
                    width: '1px', height: '60ex'
                }})
            ]);
        }
        return adaptor.append(node, adaptor.clone(this.testNodes)) as N;
    }

    /**
     * @param {N} node    The test node to measure
     * @return {Metrics}  The metric data for the given node
     */
    protected measureMetrics(node: N) {
        const adaptor = this.adaptor;
        const em = adaptor.fontSize(node);
        const ex = (adaptor.nodeSize(adaptor.firstChild(node) as N)[1] / 60) || (em * this.options.exFactor);
        const containerWidth = 80 * em; // for now (should be measured in the DOM)
        const scale = ex / this.font.params.x_height / em;
        const lineWidth = 1000000;      // no linebreaking (otherwise would be a percentage of cwidth)
        return {em, ex, containerWidth, lineWidth, scale} as Metrics;
    }

    /*****************************************************************/

    /**
     * @override
     */
    public styleSheet(html: MathDocument<N, T, D>) {
        this.setDocument(html);
        //
        // Gather the CSS from the classes
        //
        for (const kind of this.factory.getKinds()) {
            this.addClassStyles(this.factory.getNodeClass(kind));
        }
        //
        // Get the font styles
        //
        this.cssStyles.addStyles(this.font.styles);
        //
        // Create the stylesheet for the CSS
        //
        const sheet = this.html('style', {id: 'MJX-styles'}, [this.text('\n' + this.cssStyles.cssText + '\n')]);
        return sheet as N;
    }

    /**
     * @param {any} CLASS  The Wrapper class whose styles are to be added
     */
    protected addClassStyles(CLASS: typeof CommonWrapper) {
        this.cssStyles.addStyles(CLASS.styles);
    }

    /*****************************************************************/

    /**
     * @param {MathDocument} html  The document to be used
     */
    protected setDocument(html: MathDocument<N, T, D>) {
        if (html) {
            this.document = html;
            this.adaptor.document = html.document;
        }
    }

    /**
     * @param {string} type      The type of HTML node to create
     * @param {OptionList} def   The properties to set on the HTML node
     * @param {(N|T)[]} content  Array of child nodes to set for the HTML node
     * @param {string}           The namespace for the element
     * @return {N}               The newly created DOM tree
     */
    public html(type: string, def: OptionList = {}, content: (N | T)[] = [], ns?: string) {
        return this.adaptor.node(type, def, content, ns);
    }

    /**
     * @param {string} text  The text string for which to make a text node
     *
     * @return {HTMLElement}  A text node with the given text
     */
    public text(text: string) {
        return this.adaptor.text(text);
    }

}
