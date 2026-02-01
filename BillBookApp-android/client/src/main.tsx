import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ThemeProvider } from "next-themes";

console.log("main.tsx executing");
const rootElement = document.getElementById("root");
console.log("Root element found:", rootElement);

if (!rootElement) {
    console.error("Root element is missing!");
} else {
    try {
        const root = createRoot(rootElement);
        console.log("Root created, calling render...");
        root.render(
            <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <App />
            </ThemeProvider>
        );
        console.log("Render called.");
    } catch (e) {
        console.error("Error during rendering:", e);
    }
}
