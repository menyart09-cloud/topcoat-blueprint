import { pgTable, uuid, text, integer, doublePrecision, jsonb, timestamp, serial } from 'drizzle-orm/pg-core'

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobNumber: serial('job_number'),
  jobName: text('job_name').notNull().default(''),
  address: text('address').notNull().default(''),
  fracPerFt: doublePrecision('frac_per_ft'),
  aspectRatio: doublePrecision('aspect_ratio'),
  labelSizeInches: doublePrecision('label_size_inches').default(5),
  imageBase64: text('image_base64'),
  imageMime: text('image_mime').default('image/jpeg'),
  jobTotal: doublePrecision('job_total').notNull().default(0),
  miscItems: jsonb('misc_items').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name').notNull().default(''),
  sqft: doublePrecision('sqft').notNull().default(0),
  perim: doublePrecision('perim').notNull().default(0),
  points: jsonb('points').notNull(),
  color: jsonb('color').notNull(),
  pricePerSf: doublePrecision('price_per_sf'),
  coating: text('coating'),
  pricePerLf: doublePrecision('price_per_lf'),
  doorsExcluded: integer('doors_excluded').notNull().default(0),
  doorWidthFt: doublePrecision('door_width_ft').notNull().default(3),
})
