import {MathJax} from '../../mathjax3/mathjax.js';

import {RegisterHTMLHandler} from '../../mathjax3/handlers/html.js';
import {chooseAdaptor} from '../../mathjax3/adaptors/chooseAdaptor.js';

export const adaptor = chooseAdaptor();

RegisterHTMLHandler(adaptor);

export function htmlDocument(HTML, OPTIONS) {
    let html = null;
    try {
        //
        //  Use browser document, if there is one
        //
        html = MathJax.document(document, OPTIONS);
        document.documentElement.setAttribute('xmlns:m', 'http://www.w3.org/1998/Math/MathML');
        document.body.insertBefore(document.createElement('hr'), document.body.firstChild);
        var div = document.createElement('div');
        div.innerHTML = HTML; div.style.marginBottom = '1em';
        document.body.insertBefore(div, document.body.firstChild);
    } catch (err) {
        //
        //  Otherwise, make a new document (measurements not supported here)
        //
        html = MathJax.document(
            '<html xmlns:m="http://www.w3.org/1998/Math/MathML">'
                + '<head><title>Test MathJax3</title></head><body>'
                + HTML +
                '</body></html>',
            OPTIONS
        );
    }
    return html;
}
