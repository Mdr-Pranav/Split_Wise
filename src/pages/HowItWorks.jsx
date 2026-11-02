import Icon from '../components/Icon';
import BucketIcon from '../components/BucketIcon';
import { APP_NAME } from '../lib/brand';

// The ℹ️ page: how the whole app works, six cards with a tiny example each.
// Sized to fit one laptop screen; phones scroll.

function Card({ n, icon, tint, title, children, example }) {
  return (
    <section className="card flex flex-col !p-4">
      <div className="mb-1.5 flex items-center gap-2.5">
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[10px] text-white ${tint}`}>
          <Icon name={icon} className="h-[17px] w-[17px]" strokeWidth={2.1} />
        </span>
        <h2 className="flex items-baseline gap-1.5 text-[15px] font-semibold leading-tight text-ink">
          <span className="text-slate-400">{n}.</span>
          {title}
        </h2>
      </div>
      <p className="text-[13px] leading-snug text-slate-600">{children}</p>
      <div className="mt-auto pt-2.5">
        <div className="rounded-xl bg-[rgb(var(--line)/0.05)] px-3 py-2 text-[12px] leading-snug text-slate-600 ring-1 ring-[rgb(var(--line)/0.06)]">
          <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">Example</span>
          {example}
        </div>
      </div>
    </section>
  );
}

const B = ({ children, className = "" }) => <b className={`font-semibold text-ink ${className}`}>{children}</b>;
// Bucket name with its small icon, sitting on the text line
const Chip = ({ name, children }) => (
  <span className="inline-flex translate-y-[3px] items-center gap-1 whitespace-nowrap rounded-md bg-surface-card py-px pl-px pr-1.5 font-semibold text-ink ring-1 ring-[rgb(var(--line)/0.08)]">
    <BucketIcon name={name} size="sm" className="!h-[18px] !w-[18px] !rounded-[5px]" />
    <span className="-translate-y-px">{children}</span>
  </span>
);

export default function HowItWorks() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="text-[28px] font-semibold leading-tight text-ink sm:text-[32px]">How {APP_NAME} works</h1>
        <p className="text-[13px] text-slate-500">Track shared spending in buckets, then settle up the simple way.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          n="1"
          icon="users"
          tint="bg-[#007aff]"
          title="Groups you control"
          example={
            <>
              You make <B>Goa Trip</B> and share code <B className="font-mono">GOA7-K2MX</B>. Neha enters it, you tap <B>Approve</B>, she’s in.
              The code is now used up.
            </>
          }
        >
          Make a group for a trip or a flat. As the owner, you hand out <B>one-time join codes</B>, and nobody gets in until you approve them.
          You can hand ownership to someone else later.
        </Card>

        <Card
          n="2"
          icon="tag"
          tint="bg-[#ff9500]"
          title="Every expense goes in a bucket"
          example={
            <>
              <Chip name="Cab">Cab</Chip>: you owe Neha ₹50, next day she owes you ₹50 → <B>cancels out</B>. Your <Chip name="Food">Food</Chip> debt to her
              stays separate.
            </>
          }
        >
          Pick a bucket (Food, Cab, Stay…) instead of typing a name. Debts are tracked <B>per person, per bucket</B>: they cancel within a bucket,
          never across buckets.
        </Card>

        <Card
          n="3"
          icon="receipt"
          tint="bg-[#34c759]"
          title="Splitting a bill"
          example={
            <>
              <Chip name="Cab">Cab</Chip> ₹900, <B>Pay to</B> you, split equally between 3 → the other two owe you <B>₹300 each</B>.
            </>
          }
        >
          Enter the amount, choose who to <B>pay to</B> (whoever paid the bill), and split it <B>equally</B>, <B>by amount</B> or <B>by percent</B>. Tap
          people to leave them out.
        </Card>

        <Card
          n="4"
          icon="swap"
          tint="bg-[#5856d6]"
          title="Three ways to settle"
          example={
            <>
              Pranav owes ₹900, Aisha owes ₹300, Kabir is owed ₹1,200. <B>Smart settle</B>: Pranav → Kabir ₹900, Aisha → Kabir ₹300.{' '}
              <B>6 debts, 2 payments.</B>
            </>
          }
        >
          <B>One bucket</B> (all or part). <B>With a person</B>: every bucket between you, netted. <B>Smart settle</B>: the fewest payments for the whole
          group, approved by everyone involved.
        </Card>

        <Card
          n="5"
          icon="bolt"
          tint="bg-[#ff2d55]"
          title="Paying & confirming"
          example={
            <>
              You copy <B className="font-mono">aisha@okaxis</B> and ₹7,800, pay in GPay, tap <B>I’ve paid</B>. Aisha taps <B>Confirm</B> in her 🔔
              and Travel and Fun clear.
            </>
          }
        >
          Money moves in your own UPI app: copy the ID and amount, <B>Show QR</B> on a laptop, or <B>Open app</B> on a phone. UPI rules keep this manual
          between friends, so <B>nothing clears until the receiver confirms</B>.
        </Card>

        <Card
          n="6"
          icon="bell"
          tint="bg-[#8e8e93]"
          title="Nudges, export & more"
          example={
            <>
              Kabir’s owed you ₹4,500 for 3+ days → tap <B>Nudge</B>. Trip over → group Settings → <B>Export · PDF</B>.
            </>
          }
        >
          <B>Nudge</B> people who owe you (once a day). <B>Export</B> a group as CSV or PDF. Add your <B>UPI ID</B>, an <B>emoji picture</B>, and{' '}
          <B>install</B> {APP_NAME} on your phone from Settings.
        </Card>
      </div>
    </div>
  );
}
