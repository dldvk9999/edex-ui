class FuzzyFinder {
    constructor() {
        if (document.getElementById("fuzzyFinder") || document.getElementById("settingsEditor")) {
            return false;
        }
        
        window.keyboard.detach();
        
        this.disp = new Modal({
            type: "custom",
            title: "Fuzzy cwd file search",
            html: `<input type="search" id="fuzzyFinder" placeholder="Search file in cwd..." role="combobox" aria-expanded="true" aria-autocomplete="list" aria-controls="fuzzyFinder-results" />
                <ul id="fuzzyFinder-results" role="listbox" aria-label="Matching files">
                    <li class="fuzzyFinderMatchSelected"></li>
                    <li></li>
                    <li></li>
                    <li></li>
                    <li></li>
                </ul>`,
            buttons: [
                {label: "Select", action: "window.activeFuzzyFinder.submit()"}
            ]
        }, () => {
            delete window.activeFuzzyFinder;
            window.keyboard.attach();
            window.term[window.currentTerm].term.focus();
        });
        
        this.input = document.getElementById("fuzzyFinder");
        this.results = document.getElementById("fuzzyFinder-results");
        
        this.input.addEventListener('input', e => {
            if ((e.inputType && e.inputType.startsWith("delete")) || (e.detail && e.detail.startsWith("delete"))) {
                this.input.value = "";
                this.search("");
            } else {
                this.search(this.input.value);
            }
        });
        this.input.addEventListener('change', e => {
                if (e.detail === "enter") {
                    this.submit();
                }
        });
        this.input.addEventListener('keydown', e => {
            let selectedEl,selected,next;
            switch(e.key) {
                case 'Enter':
                    this.submit();
                    e.preventDefault();
                    break;
                case 'ArrowDown':
                    selectedEl = document.querySelector('li.fuzzyFinderMatchSelected');
                    selected = Number(selectedEl.id.substr(17));
                    next = (document.getElementById(`fuzzyFinderMatch-${selected+1}`)) ? selected+1 : 0;
                    this._selectMatch(next);
                    e.preventDefault();
                    break;
                case 'ArrowUp':
                    selectedEl = document.querySelector('li.fuzzyFinderMatchSelected');
                    selected = Number(selectedEl.id.substr(17));
                    next = (document.getElementById(`fuzzyFinderMatch-${selected-1}`)) ? selected-1: 0;
                    this._selectMatch(next);
                    e.preventDefault();
                    break;
                default:
                    // Do nothing, input event will be triggered
            }
        });
        
        this.search("");
        this.input.focus();
    }

    // Combines the class-based selection styling (pre-existing) with the ARIA
    // state screen readers/other assistive tech actually need (docs/10-todo.md
    // 10.3 a11y gap) - one shared implementation so the keydown handler above
    // and the per-result onclick below (see search()) can't drift out of sync.
    _selectMatch(index) {
        let prevEl = this.results.querySelector("li.fuzzyFinderMatchSelected");
        if (prevEl) {
            prevEl.removeAttribute("class");
            prevEl.setAttribute("aria-selected", "false");
        }
        let nextEl = document.getElementById(`fuzzyFinderMatch-${index}`);
        if (!nextEl) return;
        nextEl.setAttribute("class", "fuzzyFinderMatchSelected");
        nextEl.setAttribute("aria-selected", "true");
        this.input.setAttribute("aria-activedescendant", nextEl.id);
    }

    search(text) {
           let files = window.fsDisp.cwd;
           let i = 0;
           let results = files.filter(file => {
               if (i >= 5 || file.type === "showDisks" || file.type === "up") {
                    return false;
                } else if (file.name.toLowerCase().includes(text.toLowerCase())) {
                    i++
                    return true;
                }
           });
           
           results.sort((a, b) => {
               if (a.name.toLowerCase().startsWith(text.toLowerCase()) && !b.name.toLowerCase().startsWith(text.toLowerCase())) {
                   return -1;
            } else if (!a.name.toLowerCase().startsWith(text.toLowerCase()) && b.name.toLowerCase().startsWith(text.toLowerCase())) {
                return 1;
            } else {
                return 0;
            }
           });
              
        if (results.length === 0) {
             this.results.innerHTML = `<li class="fuzzyFinderMatchSelected" role="option" aria-selected="true">No results</li>
                 <li role="presentation"></li>
                  <li role="presentation"></li>
                  <li role="presentation"></li>
                  <li role="presentation"></li>`;
             this.input.removeAttribute("aria-activedescendant");
             return;
         }
         let html = "";
         results.forEach((file, i) => {
             // file.name comes from window.fsDisp.cwd, which is already
             // HTML-escaped at construction time (filesystem.class.js,
             // `name: window._escapeHtml(file)`) - escaping it again here
             // would double-encode entities (e.g. a literal "&" in a
             // filename would render as the literal text "&amp;" instead
             // of "&"). Confirmed safe to interpolate as-is.
             html += `<li id="fuzzyFinderMatch-${i}" role="option" aria-selected="${(i === 0) ? 'true' : 'false'}" class="${(i === 0) ? 'fuzzyFinderMatchSelected' : ''}" onclick="window.activeFuzzyFinder._selectMatch(${i})">${file.name}</li>`;
        });
        if (results.length !== 5) {
            for (let i = results.length; i < 5; i++) {
                html += `<li role="presentation"></li>`;
            }
        }
        this.results.innerHTML = html;
        this.input.setAttribute("aria-activedescendant", "fuzzyFinderMatch-0");
      }
      submit() {
         let file = document.querySelector("li.fuzzyFinderMatchSelected").innerText;
         if (file === "No results" || file.length <= 0) {
             this.disp.close();
             return;
        }
        
        let filePath = path.resolve(window.fsDisp.dirpath, file);
        
          window.term[window.currentTerm].write(`'${filePath}'`);
          this.disp.close();
     }
}

module.exports = {
    FuzzyFinder
};
