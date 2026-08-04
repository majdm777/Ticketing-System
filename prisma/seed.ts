import {
  PrismaClient,
  EventStatus,
  SeatStatus,
  BookingStatus,
  CaseType,
} from '@prisma/client'

const prisma = new PrismaClient()

function buildSeats(section: string, rows: number, seatsPerRow: number) {
  const rowsArr = 'ABCDEFGH'.slice(0, rows).split('')
  const seats: { row: string; number: string; section: string }[] = []
  for (const row of rowsArr) {
    for (let n = 1; n <= seatsPerRow; n++) {
      seats.push({ row, number: String(n), section })
    }
  }
  return seats
}

function future(days: number, hour = 19) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

function ref(prefix: string) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `${prefix}-${rand}`
}

function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function main() {
  if (process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error(
      'Refusing to wipe the database. Set ALLOW_DESTRUCTIVE_SEED=true to run the destructive seed.',
    )
  }

  await prisma.booking.deleteMany()
  await prisma.eventSeat.deleteMany()
  await prisma.event.deleteMany()
  await prisma.venueSeat.deleteMany()
  await prisma.venue.deleteMany()

  const venueA = await prisma.venue.create({
    data: {
      name: 'Grand Hall',
      address: '123 Main St, Springfield',
      seats: {
        create: [...buildSeats('Floor', 3, 8), ...buildSeats('Balcony', 2, 6)],
      },
    },
    include: { seats: true },
  })

  const venueB = await prisma.venue.create({
    data: {
      name: 'The Loft',
      address: '456 Oak Ave, Riverside',
      seats: { create: buildSeats('General Admission', 4, 5) },
    },
    include: { seats: true },
  })

  const events = await prisma.event.createManyAndReturn({
    data: [
      {
        venueId: venueA.id,
        name: 'Jazz Under the Stars',
        description: 'An evening of live jazz with the Riverside Quartet.',
        slug: 'jazz-under-the-stars',
        startsAt: future(7),
        status: EventStatus.PUBLISHED,
      },
      {
        venueId: venueA.id,
        name: 'Comedy Night: Stand-Up Special',
        description: 'A night of laughter with five up-and-coming comedians.',
        slug: 'comedy-night-stand-up',
        startsAt: future(14),
        status: EventStatus.DRAFT,
      },
      {
        venueId: venueB.id,
        name: 'Indie Rock Showcase',
        description: 'Three local indie bands on one stage.',
        slug: 'indie-rock-showcase',
        startsAt: future(-3),
        status: EventStatus.CLOSED,
      },
    ],
  })

  for (const event of events) {
    const venue = await prisma.venue.findUnique({
      where: { id: event.venueId },
      include: { seats: true },
    })
    if (!venue) continue

    await prisma.eventSeat.createMany({
      data: venue.seats.map((s) => ({
        eventId: event.id,
        venueSeatId: s.id,
        venueId: venue.id,
      })),
    })
  }

  const jazz = events.find((event) => event.slug === 'jazz-under-the-stars')
  const showcase = events.find((event) => event.slug === 'indie-rock-showcase')
  if (!jazz || !showcase) {
    throw new Error('Expected seed events were not created.')
  }

  const jazzSeats = await prisma.eventSeat.findMany({
    where: { eventId: jazz.id },
    orderBy: { venueSeatId: 'asc' },
    include: { venueSeat: true },
  })

  const bookedSeats = [jazzSeats[0], jazzSeats[5], jazzSeats[12], jazzSeats[20]]
  for (const seat of bookedSeats) {
    await prisma.eventSeat.update({
      where: { id: seat.id },
      data: { status: SeatStatus.BOOKED },
    })
    await prisma.booking.create({
      data: {
        eventId: jazz.id,
        eventSeatId: seat.id,
        userName: 'Alice Johnson',
        userPhone: '+15550123456',
        caseType: CaseType.ONLINE_CODE,
        status: BookingStatus.CONFIRMED,
        referenceCode: ref('TKT'),
        confirmedByAdmin: 'admin@example.com',
        confirmedAt: new Date(),
        ticketToken: token(),
        ticketPdfUrl: null,
        ticketSentAt: new Date(),
      },
    })
  }

  const pendingSeat = jazzSeats[2]
  const pendingExpiresAt = new Date(Date.now() + 3_600_000)
  await prisma.eventSeat.update({
    where: { id: pendingSeat.id },
    data: {
      status: SeatStatus.PENDING,
      bookedByName: 'Bob Miller',
      bookedByPhone: '+15550987654',
      pendingSince: new Date(),
      expiresAt: pendingExpiresAt,
    },
  })
  await prisma.booking.create({
    data: {
      eventId: jazz.id,
      eventSeatId: pendingSeat.id,
      userName: 'Bob Miller',
      userPhone: '+15550987654',
      caseType: CaseType.PAY_AT_DOOR,
      status: BookingStatus.PENDING,
      expiresAt: pendingExpiresAt,
    },
  })

  const cancelledSeat = jazzSeats[9]
  await prisma.booking.create({
    data: {
      eventId: jazz.id,
      eventSeatId: cancelledSeat.id,
      userName: 'Carla Reyes',
      userPhone: '+15551112233',
      caseType: CaseType.GUEST,
      status: BookingStatus.CANCELLED,
      referenceCode: ref('TKT'),
      cancelledAt: new Date(),
    },
  })
  await prisma.eventSeat.update({
    where: { id: cancelledSeat.id },
    data: {
      status: SeatStatus.AVAILABLE,
      bookedByName: null,
      bookedByPhone: null,
      referenceCode: null,
      pendingSince: null,
      expiresAt: null,
    },
  })
  await prisma.eventSeat.update({
    where: { id: cancelledSeat.id },
    data: { status: SeatStatus.BOOKED },
  })
  await prisma.booking.create({
    data: {
      eventId: jazz.id,
      eventSeatId: cancelledSeat.id,
      userName: 'David Kim',
      userPhone: '+15552223344',
      caseType: CaseType.PAY_AT_DOOR,
      status: BookingStatus.CONFIRMED,
      referenceCode: ref('TKT'),
      confirmedByAdmin: 'admin@example.com',
      confirmedAt: new Date(),
      ticketToken: token(),
      ticketSentAt: new Date(),
    },
  })

  const showcaseSeats = await prisma.eventSeat.findMany({
    where: { eventId: showcase.id },
    take: 5,
  })
  for (const seat of showcaseSeats) {
    await prisma.eventSeat.update({
      where: { id: seat.id },
      data: { status: SeatStatus.BOOKED },
    })
    await prisma.booking.create({
      data: {
        eventId: showcase.id,
        eventSeatId: seat.id,
        userName: 'Dan Osei',
        userPhone: '+15554443322',
        caseType: CaseType.ONLINE_CODE,
        status: BookingStatus.CONFIRMED,
        referenceCode: ref('TKT'),
        confirmedByAdmin: 'admin@example.com',
        confirmedAt: new Date(),
        ticketToken: token(),
        ticketSentAt: new Date(),
      },
    })
  }

  const counts = {
    venues: await prisma.venue.count(),
    seats: await prisma.venueSeat.count(),
    events: await prisma.event.count(),
    eventSeats: await prisma.eventSeat.count(),
    bookings: await prisma.booking.count(),
  }
  console.log('Seed complete:', counts)
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
