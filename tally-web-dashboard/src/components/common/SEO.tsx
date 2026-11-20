import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getSearchPage, productSchema, siteOrigin, socialImage } from '../../config/searchPages.mjs';

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
    ogImage = socialImage,
    ogUrl,
    twitterHandle,
    canonical,
    schema
}: SEOProps) {
    useEffect(() => {
        if (getSearchPage(window.location.pathname)) return;
        // Update Document Title
        document.title = title;

        // Update Meta Tags
        updateMetaTag('description', description);
        updateMetaTag('keywords', keywords);

        // Open Graph
        updateMetaTag('og:title', ogTitle || title, 'property');
        updateMetaTag('og:description', ogDescription || description, 'property');
        updateMetaTag('og:image', ogImage, 'property');
        updateMetaTag('og:url', ogUrl || new URL(window.location.pathname, siteOrigin).href, 'property');
        updateMetaTag('og:type', 'website', 'property');

        // Twitter
        updateMetaTag('twitter:card', 'summary_large_image');
        if (twitterHandle) updateMetaTag('twitter:site', twitterHandle);
        updateMetaTag('twitter:title', ogTitle || title);
        updateMetaTag('twitter:description', ogDescription || description);
        updateMetaTag('twitter:image', ogImage);

        // Canonical
        {
            const canonicalHref = canonical || new URL(window.location.pathname, 'https://tallyonmob.vercel.app').href;
            let link: HTMLLinkElement | null = document.querySelector("link[rel='canonical']");
            if (!link) {
                link = document.createElement('link');
                link.setAttribute('rel', 'canonical');
                document.head.appendChild(link);
            }
            link.setAttribute('href', canonicalHref);
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
            document.querySelector("link[rel='canonical']")?.remove();
            if (schema) document.getElementById('json-ld-schema')?.remove();
        };
    }, [title, description, keywords, ogTitle, ogDescription, ogImage, ogUrl, twitterHandle, canonical, schema]);

    return null;
}

export function SearchMetadata() {
    const { pathname } = useLocation();
    useEffect(() => {
        const page = getSearchPage(pathname);
        updateMetaTag('robots', page ? 'index, follow, max-image-preview:large' : 'noindex, follow');
        let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        let schema = document.getElementById('public-search-schema');
        if (!page) {
            canonical?.remove();
            schema?.remove();
            return;
        }
        document.title = page.title;
        updateMetaTag('description', page.description);
        updateMetaTag('og:type', 'website', 'property');
        updateMetaTag('og:site_name', 'Syncora', 'property');
        updateMetaTag('og:title', page.title, 'property');
        updateMetaTag('og:description', page.description, 'property');
        updateMetaTag('og:image', socialImage, 'property');
        updateMetaTag('og:image:width', '1200', 'property');
        updateMetaTag('og:image:height', '630', 'property');
        updateMetaTag('og:image:alt', 'Syncora — Tally on mobile and web', 'property');
        updateMetaTag('og:url', page.canonical, 'property');
        updateMetaTag('twitter:card', 'summary_large_image');
        updateMetaTag('twitter:title', page.title);
        updateMetaTag('twitter:description', page.description);
        updateMetaTag('twitter:image', socialImage);
        document.querySelector('meta[name="twitter:site"]')?.remove();

        if (!canonical) {
            canonical = document.createElement('link');
            canonical.rel = 'canonical';
            document.head.appendChild(canonical);
        }
        canonical.href = page.canonical;
        if (page.canonical === siteOrigin + '/') {
            if (!schema) {
                const script = document.createElement('script');
                script.id = 'public-search-schema';
                script.type = 'application/ld+json';
                document.head.appendChild(script);
                schema = script;
            }
            schema.textContent = JSON.stringify(productSchema);
        } else {
            schema?.remove();
        }
    }, [pathname]);
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
