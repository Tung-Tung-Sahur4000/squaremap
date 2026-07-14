import { Pin } from "./util/Pin.js";
import { Fieldset } from "./util/Fieldset.js";
import { S } from "./Squaremap.js";

const MENU_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>';
const CLOSE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

class Sidebar {
    /** @type {HTMLDivElement} */
    sidebar;
    /** @type {boolean} */
    showSidebar;
    /** @type {Pin} */
    pin;
    /** @type {Fieldset} */
    worlds;
    /** @type {Fieldset} */
    players;
    /** @type {HTMLButtonElement} */
    toggleButton;
    /** @type {HTMLDivElement} */
    backdrop;

    /**
     * @param {Settings_UI_Sidebar} json
     * @param {boolean} show
     */
    constructor(json, show) {
        this.sidebar = S.createElement("div", "sidebar", this);
        this.showSidebar = show;
        if (!show) {
            this.sidebar.style.display = "none";
        }
        this.sidebar.addEventListener("click", (e) => {
            S.playerList.followPlayerMarker(null);
            e.stopPropagation();
        });
        document.body.appendChild(this.sidebar);

        // Backdrop for the overlay panel on touch / small screens.
        this.backdrop = S.createElement("div", "sidebar-backdrop", this);
        this.backdrop.addEventListener("click", () => this.toggle(false));
        document.body.appendChild(this.backdrop);

        // Explicit toggle button — the only way to open the sidebar on touch
        // devices (which have no hover), and a convenience on desktop.
        this.toggleButton = document.createElement("button");
        this.toggleButton.id = "menu-toggle";
        this.toggleButton.type = "button";
        this.toggleButton.setAttribute("aria-label", "Toggle menu");
        this.toggleButton.innerHTML = MENU_ICON;
        this.toggleButton.addEventListener("click", (e) => {
            e.stopPropagation();
            this.toggle();
        });
        if (!show) {
            this.toggleButton.style.display = "none";
        }
        document.body.appendChild(this.toggleButton);

        this.pin = new Pin(json.pinned === "pinned");
        this.show(this.pin.pinned);
        if (json.pinned !== "hide") {
            this.sidebar.appendChild(this.pin.element);
        }

        this.worlds = new Fieldset("worlds", json.world_list_label);
        this.sidebar.appendChild(this.worlds.element);

        this.players = new Fieldset("players", json.player_list_label.replace(/{cur}/g, 0).replace(/{max}/g, 0));
        this.sidebar.appendChild(this.players.element);

        // Hover-to-peek only makes sense with a fine pointer (mouse); touch
        // devices open/close explicitly via the toggle button and backdrop.
        this.hoverCapable = window.matchMedia("(hover: hover) and (pointer: fine)");
        this.sidebar.onmouseleave = () => {
            if (this.hoverCapable.matches && !this.pin.pinned) {
                this.show(false);
            }
        };
        this.sidebar.onmouseenter = () => {
            if (this.hoverCapable.matches && !this.pin.pinned) {
                this.show(true);
            }
        };

        document.addEventListener("click", (e) => {
            if (
                this.hoverCapable.matches &&
                !this.sidebar.contains(e.target) &&
                !this.pin.pinned &&
                this.sidebar.classList.contains("show")
            ) {
                this.show(false);
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && this.sidebar.classList.contains("show") && !this.pin.pinned) {
                this.toggle(false);
            }
        });
    }
    /**
     * Explicitly open or close the sidebar (used by the toggle button,
     * backdrop and Escape key). The dimming backdrop is only used on touch /
     * small screens, where it captures outside taps; on desktop the map stays
     * fully visible and hover/outside-click handle closing.
     * @param {boolean} [force]
     */
    toggle(force) {
        const open = force === undefined ? !this.sidebar.classList.contains("show") : force;
        this.show(open);
        this.backdrop.classList.toggle("show", open && !this.hoverCapable.matches);
    }
    show(show) {
        this.sidebar.classList.toggle("show", show);
        if (!show) {
            this.backdrop.classList.remove("show");
        }
        if (this.toggleButton != null) {
            this.toggleButton.innerHTML = show ? CLOSE_ICON : MENU_ICON;
            this.toggleButton.setAttribute("aria-expanded", String(show));
        }
    }
    remove() {
        this.sidebar.remove();
        this.backdrop.remove();
        this.toggleButton.remove();
    }
}

export { Sidebar };
