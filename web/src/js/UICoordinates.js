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
                const world = S.worldList == null ? null : S.worldList.curWorld;
                if (point == null || world == null || world.biomes !== true) {
                    this._biomeText.textContent = "";
                    return;
                }
                const name = biomeLayer.nameAt(world.name, Math.floor(point.x), Math.floor(point.y));
                this._biomeText.textContent = name == null ? "" : name;
            },
        });
        this.showCoordinates = show;
        this.html = json.html == null ? "undefined" : json.html;
        this.coords = new Coords();
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
