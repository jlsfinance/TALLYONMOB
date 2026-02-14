import { useEffect } from 'react';

interface SEOProps {
    title?: string;
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    ogUrl?: string;
    twitterHandle?: string;
    canonical?: string;
    schema?: any; // JSON-LD
}

/**
 * Enterprise-grade SEO component for TallyLink.
 * Handles meta tags, social preview, and JSON-LD schema for GEO/SEO optimization.
 */
export default function SEO({
    title = 'TallyLink | Access Tally ERP 9 & TallyPrime Data on Mobile',
    description = 'TallyLink provides real-time access to your Tally ERP 9 and TallyPrime data on mobile and web. Secure, automated cloud sync for Indian businesses.',
    keywords = 'Tally mobile app, Tally on mobile, Tally cloud sync, GST reports online, Tally ERP 9 mobile access, TallyPrime cloud',
    ogTitle,
    ogDescription,
    ogImage = 'https://tallyonmob.vercel.app/og-image.jpg', // Placeholder, update when real asset exists
    ogUrl = 'https://tallyonmob.vercel.app',
    twitterHandle = '@tallylink',
    canonical,
    schema
}: SEOProps) {
    useEffect(() => {
        // Update Document Title
        document.title = title;

        // Update Meta Tags
        updateMetaTag('description', description);
        updateMetaTag('keywords', keywords);

        // Open Graph
        updateMetaTag('og:title', ogTitle || title, 'property');
        updateMetaTag('og:description', ogDescription || description, 'property');
        updateMetaTag('og:image', ogImage, 'property');
        updateMetaTag('og:url', ogUrl, 'property');
        updateMetaTag('og:type', 'website', 'property');

        // Twitter
        updateMetaTag('twitter:card', 'summary_large_image');
        updateMetaTag('twitter:site', twitterHandle);
        updateMetaTag('twitter:title', ogTitle || title);
        updateMetaTag('twitter:description', ogDescription || description);
        updateMetaTag('twitter:image', ogImage);

        // Canonical
        if (canonical) {
            let link: HTMLLinkElement | null = document.querySelector("link[rel='canonical']");
            if (!link) {
                link = document.createElement('link');
                link.setAttribute('rel', 'canonical');
                document.head.appendChild(link);
            }
            link.setAttribute('href', canonical);
        }

        // JSON-LD Schema
        if (schema) {
            let script = document.getElementById('json-ld-schema') as HTMLScriptElement;
            if (!script) {
                script = document.createElement('script');
                script.id = 'json-ld-schema';
                script.type = 'application/ld+json';
                document.head.appendChild(script);
            }
            script.text = JSON.stringify(schema);
        }

        return () => {
            // Optional cleanup if needed for dynamic pages
        };
    }, [title, description, keywords, ogTitle, ogDescription, ogImage, ogUrl, twitterHandle, canonical, schema]);

    return null;
}

function updateMetaTag(name: string, content: string, attr: 'name' | 'property' = 'name') {
    let element = document.querySelector(`meta[${attr}="${name}"]`);
    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attr, name);
        document.head.appendChild(element);
    }
    element.setAttribute('content', content);
}
