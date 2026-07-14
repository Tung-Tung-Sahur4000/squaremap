import { S } from "./Squaremap.js";
import { biomeLayer } from "./util/Biome.js";
import L from "leaflet";

class UICoordinates {
    /**
     * @param {Settings_UI_Coordinates} json
     * @param {boolean} show
     */
    constructor(json, show) {
        const Coords = L.Control.extend({
            _container: null,
            options: {
                position: "bottomleft",
            },
            onAdd: function () {
                const coords = L.DomUtil.create("div", "leaflet-control-layers coordinates");
                this._coordsText = L.DomUtil.create("span", "coordinates-text", coords);
                this._biomeText = L.DomUtil.create("span", "biome-text", coords);
                this._biomeName = "";
                this._coords = coords;
                if (!show) {
                    this._coords.style.display = "none";
                }
                return coords;
            },
            update: function (html, point) {
                this.x = point == null ? "---" : Math.floor(point.x);
                this.z = point == null ? "---" : Math.floor(point.y);
                if (html != null) {
                    this._coordsText.innerHTML = html.replace(/{x}/g, this.x).replace(/{z}/g, this.z);
                }
                this.updateBiome(point);
            },
            updateBiome: function (point) {
                if (this._coords.style.display === "none") {
                    return; // readout hidden: skip per-move biome lookup entirely
                }
                const world = S.worldList == null ? null : S.worldList.curWorld;
                let name = "";
                if (point != null && world != null && world.biomes === true) {
                    name = biomeLayer.nameAt(world.name, Math.floor(point.x), Math.floor(point.y)) ?? "";
                }
                // Only touch the DOM when the biome actually changes; the cursor
                // fires mousemove continuously but usually stays in one biome.
                if (name !== this._biomeName) {
                    this._biomeName = name;
                    this._biomeText.textContent = name;
                }
            },
        });
        this.showCoordinates = show;
        this.html = json.html == null ? "undefined" : json.html;
        this.coords = new Coords();
        // On touch / small screens the bottom of the map is easily hidden behind
        // the mobile browser chrome, so move the readout up next to the zoom
        // controls at the top-left. Desktop keeps it in the bottom-left.
        if (window.matchMedia("(max-width: 768px), (pointer: coarse)").matches) {
            this.coords.setPosition("topleft");
        }
        S.map.addControl(this.coords).addEventListener("mousemove", (event) => {
            if (S.worldList.curWorld != null) {
                this.coords.update(this.html, S.toPoint(event.latlng));
            }
        });
        if (!json.enabled) {
            this.coords._coords.style.display = "none";
        }
        this.coords.update(this.html);
    }
}

export { UICoordinates };
