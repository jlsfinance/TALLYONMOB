import { Link } from 'react-router-dom';

export default function PublicPricingIntro() {
  return (
    <section className="subscription-section-heading">
      <div>
      <h2>Syncora plans and free trial</h2>
      <p>New accounts receive a 90-day trial. Compare the current prices and details for monthly, six-month and yearly access below.</p>
      <Link to="/guides/tallyprime-setup">How to connect TallyPrime</Link>
      </div>
    </section>
  );
}
