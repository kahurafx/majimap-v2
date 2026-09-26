import type {Metadata} from "next";
import {Geist, Geist_Mono, Inter, Space_Grotesk} from "next/font/google";
import "./globals.css";
import {cn} from "@/lib/utils";
import {TooltipProvider} from "@/components/ui/tooltip";
import {ThemeProvider} from "next-themes";
import {Toaster} from "sonner";

const spaceGrotesk = Space_Grotesk({subsets: ['latin'], variable: '--font-sans'});

const geistSans = Geist({
    variable: "--font-geist-sans",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    title: "MajiMap - Water Distribution Network",
    description: "GIS management for a water utility's distribution network.",
};

export default function RootLayout({children}: LayoutProps<"/">) {
    return (
        <html
            lang="en"
            className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", spaceGrotesk.variable)}
            suppressHydrationWarning
        >
        <body className="min-h-full flex flex-col">
        <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
        >
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster position="top-right" richColors/>
        </ThemeProvider>
        </body>
        </html>
    );
}
