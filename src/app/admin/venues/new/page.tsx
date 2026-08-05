import { VenueBuilder } from './venue-builder';


export default function NewVenuePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-1">Add Venue</h1>
      <p className="text-gray-600 mb-8">
        Define the venue and its seating sections — seats are generated automatically.
      </p>
      <VenueBuilder />
    </div>
  );
}