import { prisma } from '@/lib/services/database';
import AnalyticsView from '@/components/AnalyticsView';

export default function AnalyticsPage() {
    return <AnalyticsView tasks={[]} events={[]} />;
}
