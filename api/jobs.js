import 'dotenv/config'
import { eq, desc, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { jobs, rooms } from '../db/schema.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const { action } = req.body

  try {
    if (action === 'list') return res.status(200).json(await listJobs())
    if (action === 'get') return res.status(200).json(await getJob(req.body.id))
    if (action === 'save') return res.status(200).json(await saveJob(req.body.job, req.body.rooms))
    return res.status(400).json({ error: 'Unknown action: ' + action })
  } catch (err) {
    return res.status(500).json({ error: 'Jobs request failed: ' + (err.message || 'Unknown error') })
  }
}

async function listJobs() {
  const rows = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      jobName: jobs.jobName,
      jobTotal: jobs.jobTotal,
      updatedAt: jobs.updatedAt,
      roomCount: sql`count(${rooms.id})`.mapWith(Number),
    })
    .from(jobs)
    .leftJoin(rooms, eq(rooms.jobId, jobs.id))
    .groupBy(jobs.id)
    .orderBy(desc(jobs.updatedAt))

  return { jobs: rows }
}

async function getJob(id) {
  if (!id) throw new Error('Missing job id')
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id))
  if (!job) return { error: 'Job not found' }
  const jobRooms = await db.select().from(rooms).where(eq(rooms.jobId, id)).orderBy(rooms.position)
  return { job, rooms: jobRooms }
}

async function saveJob(job, roomList) {
  if (!job) throw new Error('Missing job data')
  roomList = roomList || []

  const jobValues = {
    jobName: job.jobName || 'Untitled Job',
    address: job.address || '',
    fracPerFt: job.fracPerFt,
    aspectRatio: job.aspectRatio,
    labelSizeInches: job.labelSizeInches,
    imageBase64: job.imageBase64,
    imageMime: job.imageMime || 'image/jpeg',
    jobTotal: job.jobTotal || 0,
    miscItems: job.miscItems || [],
    updatedAt: new Date(),
  }

  let jobId = job.id
  let jobNumber

  if (jobId) {
    const [updated] = await db.update(jobs).set(jobValues).where(eq(jobs.id, jobId)).returning({ jobNumber: jobs.jobNumber })
    if (!updated) throw new Error('Job not found for update')
    jobNumber = updated.jobNumber
  } else {
    const [created] = await db.insert(jobs).values(jobValues).returning({ id: jobs.id, jobNumber: jobs.jobNumber })
    jobId = created.id
    jobNumber = created.jobNumber
  }

  const roomRows = roomList.map((r, i) => ({
    jobId,
    position: i,
    name: r.name || '',
    sqft: r.sqft || 0,
    perim: r.perim || 0,
    points: r.points || [],
    color: r.color || {},
    pricePerSf: r.pricePerSf,
    coating: r.coating || '',
    pricePerLf: r.pricePerLf,
    doorsExcluded: r.doorsExcluded || 0,
    doorWidthFt: r.doorWidthFt || 3,
  }))

  // neon-http has no transaction() support — db.batch() is the documented
  // alternative, running these as one atomic request under the hood.
  const batchQueries = [db.delete(rooms).where(eq(rooms.jobId, jobId))]
  if (roomRows.length > 0) batchQueries.push(db.insert(rooms).values(roomRows))
  await db.batch(batchQueries)

  return { id: jobId, jobNumber }
}
