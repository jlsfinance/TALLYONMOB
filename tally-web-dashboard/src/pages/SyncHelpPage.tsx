import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, LifeBuoy, Mail, Phone, Search } from 'lucide-react';
import { HeaderPortal } from '../components/layout/HeaderPortal';
import './SyncHelpPage.css';

const questions = [
    ['Sync pending क्यों दिख रहा है?', 'यह warning तब दिखती है जब पिछले सफल sync को तीन दिन या अधिक हो गए हों। PC पर Tally और Syncora खोलकर sync status देखें।'],
    ['Sync शुरू कैसे करूँ?', 'जिस कंप्यूटर पर Tally चलता है, वहाँ Syncora PC app खोलें, उसी account से login करें और सही company चुनकर sync शुरू करें।'],
    ['PC बंद होने पर sync होगा?', 'नहीं। Tally से नया data लेने के लिए संबंधित PC, Tally और Syncora connector चालू होने चाहिए। पहले से synced data web पर देखा जा सकता है।'],
    ['Tally से connection नहीं बन रहा?', 'Tally खोलें और company load करें। PC app में Tally connection और configured port जाँचें; फिर connector दोबारा खोलें।'],
    ['Port 9000 क्या है?', 'यह Tally के local connection का आम default port है। आपके Tally में अलग port configured हो सकता है; वही PC app में इस्तेमाल करें।'],
    ['Tally restart के बाद sync क्यों रुका?', 'Tally फिर से खोलें, company load करें और PC app का connection status देखें। जरूरत हो तो connector restart करके sync दोबारा चलाएँ।'],
    ['Company list में मेरी company नहीं दिखती?', 'Tally में सही company खोलें, PC app और web पर एक ही account से login करें, फिर sync पूरा होने के बाद company list refresh करें।'],
    ['गलत company का data दिख रहा है?', 'Company selector से सही company चुनें और Tally में उसी company का नाम जाँचें। डेटा delete करने से पहले support से संपर्क करें।'],
    ['Sync बहुत धीमा क्यों है?', 'पहली बार या पुराने data का बड़ा sync अधिक समय ले सकता है। PC और इंटरनेट चालू रखें तथा PC app के logs में progress या error देखें।'],
    ['Sync बीच में रुक गया तो क्या करें?', 'इंटरनेट और Tally connection जाँचें। PC app के log में error देखें और connection ठीक होने पर sync दोबारा चलाएँ।'],
    ['Sync successful है, लेकिन data पुराना दिख रहा है?', 'सही company और financial year जाँचें। Dashboard refresh करें और sync history में अंतिम सफल समय तथा किसी error को देखें।'],
    ['Voucher नहीं दिख रहा?', 'Company, financial year, तारीख, voucher type और search filter जाँचें। Tally में voucher मौजूद होने की पुष्टि करें, फिर sync status देखें।'],
    ['Delete किया voucher अभी भी दिख रहा है?', 'Sync और dashboard refresh करने के बाद भी voucher दिखे तो voucher number और तारीख के साथ support को बताएँ। उसे दोबारा delete या edit करने से पहले जाँच कराएँ।'],
    ['एक voucher दो बार दिख रहा है?', 'Voucher number, date और party की तुलना करें; Tally में देखें कि दो अलग vouchers तो नहीं हैं। जानकारी support को भेजें; बिना पुष्टि के कोई entry delete न करें।'],
    ['Voucher का total Tally से अलग है?', 'उसी voucher की items, tax, discount और round-off Tally से मिलाएँ। Voucher number, company और दोनों screenshots के साथ support को बताएँ।'],
    ['Party या ledger नहीं मिल रहा?', 'सही company और नाम की spelling जाँचें, search साफ करें और sync पूरा होने दें। Tally में ledger मौजूद है या नहीं यह भी देखें।'],
    ['Customer या supplier list खाली है?', 'सही financial year और filters जाँचें। Tally में संबंधित entries और ledger group देखें; sync पूरा होने के बाद फिर जाँचें।'],
    ['Balance अलग क्यों दिखता है?', 'Tally और app में वही company, तारीख और ledger चुनें। Opening balance और pending sync जाँचें; फर्क बना रहे तो support से मिलान कराएँ।'],
    ['Stock quantity अलग क्यों है?', 'सही item, unit और company मिलाएँ। Tally में हाल की stock entries और sync status देखें; units को अनुमान से जोड़ें नहीं।'],
    ['Report खाली या अधूरी है?', 'Date range, financial year, company और filters जाँचें। Sync अधूरा हो या report के लिए data उपलब्ध न हो तो support को report का नाम बताएँ।'],
    ['Financial year कैसे बदलें?', 'Dashboard या संबंधित report में FY selector से वांछित साल चुनें। भारत में सामान्य financial year अप्रैल से मार्च तक होता है।'],
    ['Login या session expired होने पर क्या करें?', 'फिर से उसी registered account से sign in करें। अगर समस्या बनी रहे तो error का screenshot और registered email support को दें।'],
    ['PDF नहीं खुल रहा या डाउनलोड नहीं हो रहा?', 'Browser में downloads और pop-ups की अनुमति जाँचें और दोबारा कोशिश करें। Error का नाम और प्रभावित report या voucher support को बताएँ।'],
    ['WhatsApp share काम नहीं कर रहा?', 'Party का फोन नंबर country code सहित जाँचें और device पर WhatsApp या WhatsApp Web उपलब्ध रखें। संदेश भेजने से पहले उसे स्वयं जाँचें।'],
    ['Internet बंद हो जाए तो क्या होगा?', 'नया cloud sync पूरा होने के लिए इंटरनेट चाहिए। इंटरनेट वापस आने पर PC app की स्थिति और अंतिम सफल sync समय जाँचें।'],
    ['दो Syncora PC apps साथ चल रहे हों तो?', 'उसी Tally data के लिए एक connector instance रखें। दूसरे instance को बंद करने से पहले सुनिश्चित करें कि सही account और company वाले app को चालू रखा है।'],
    ['Support को क्या भेजना चाहिए?', 'Registered email, company name, समस्या का समय, संबंधित voucher number और error का screenshot भेजें। Password, OTP, token या API key कभी साझा न करें।'],
    ['Cloud या remote Tally से connection कैसे बनेगा?', 'Connector को Tally तक network access और जरूरी permissions चाहिए। Server administrator से connection जाँचने को कहें; Tally port को सार्वजनिक इंटरनेट पर खोलने से पहले सुरक्षा जाँचें।'],
];

export default function SyncHelpPage() {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const visible = useMemo(() => questions.filter(([question, answer]) => `${question} ${answer}`.toLowerCase().includes(search.trim().toLowerCase())), [search]);
    return <div className="sync-help-page">
        <HeaderPortal type="title"><div className="sync-help-header"><button type="button" aria-label="Back to dashboard" onClick={() => navigate('/dashboard')}><ArrowLeft size={20} /></button><h1>Help &amp; Support</h1></div></HeaderPortal>
        <section className="sync-help-intro"><LifeBuoy size={24} /><div><h2>हम आपकी मदद के लिए हैं</h2><p>Sync, Tally और app से जुड़े आम सवालों के जवाब।</p></div></section>
        <label className="sync-help-search"><Search size={18} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="अपना सवाल खोजें..." aria-label="Search help questions" /></label>
        <div className="sync-help-heading"><h2>अक्सर पूछे जाने वाले सवाल</h2><span>{visible.length} सवाल</span></div>
        <div className="sync-help-faq">{visible.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}{visible.length === 0 && <p className="sync-help-empty">इस खोज से कोई सवाल नहीं मिला। दूसरे शब्दों से खोजें या नीचे संपर्क करें।</p>}</div>
        <section className="sync-help-contact"><h2>अभी भी मदद चाहिए?</h2><p>हमें कॉल या ईमेल करें।</p><a href="tel:+919413821007"><Phone size={17} /> 9413821007</a><a href="mailto:lovneetrathhi@gmail.com"><Mail size={17} /> lovneetrathhi@gmail.com</a></section>
    </div>;
}
