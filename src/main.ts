import "./styles.css";
import { mount } from "./app";
import { registerSW } from "virtual:pwa-register";

// Auto-update the service worker in the background.
registerSW({ immediate: true });

const el = document.getElementById("app");
if (el) mount(el);
