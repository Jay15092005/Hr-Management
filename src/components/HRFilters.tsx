import { useState, useEffect } from 'react'
import { supabase, type Resume } from '../lib/supabase'
import './HRFilters.css'

interface FilterCriteria {
  minDate: string
  maxDate: string
  minExperience: number
  location: string
  degree: string
}

interface HRFiltersProps {
  onFilteredResumes: (resumes: Resume[]) => void
  onClearFilters: () => void
  compact?: boolean
}

export default function HRFilters({
  onFilteredResumes,
  onClearFilters,
  compact = false,
}: HRFiltersProps) {
  const [filters, setFilters] = useState<FilterCriteria>({
    minDate: '',
    maxDate: '',
    minExperience: 0,
    location: '',
    degree: '',
  })
  const [loading, setLoading] = useState(false)
  const [allResumes, setAllResumes] = useState<Resume[]>([])

  useEffect(() => {
    fetchAllResumes()
  }, [])

  const fetchAllResumes = async () => {
    try {
      const { data, error } = await supabase
        .from('resumes')
        .select('*')
        .order('date_of_application', { ascending: false })

      if (error) throw error
      setAllResumes(data || [])
      onFilteredResumes(data || [])
    } catch (err) {
      console.error('Error fetching resumes:', err)
    }
  }

  const handleFilterChange = (field: keyof FilterCriteria, value: string | number) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const applyFilters = () => {
    setLoading(true)
    let filtered = [...allResumes]

    // Filter by date range
    if (filters.minDate) {
      filtered = filtered.filter(
        (r) => new Date(r.date_of_application) >= new Date(filters.minDate)
      )
    }
    if (filters.maxDate) {
      filtered = filtered.filter(
        (r) => new Date(r.date_of_application) <= new Date(filters.maxDate)
      )
    }

    // Filter by minimum experience
    if (filters.minExperience > 0) {
      filtered = filtered.filter(
        (r) => (r.years_of_experience || 0) >= filters.minExperience
      )
    }

    // Filter by location
    if (filters.location) {
      filtered = filtered.filter(
        (r) =>
          r.location?.toLowerCase().includes(filters.location.toLowerCase()) ||
          false
      )
    }

    // Filter by degree
    if (filters.degree) {
      filtered = filtered.filter(
        (r) =>
          r.degree?.toLowerCase().includes(filters.degree.toLowerCase()) || false
      )
    }

    setLoading(false)
    onFilteredResumes(filtered)
  }

  const clearFilters = () => {
    setFilters({
      minDate: '',
      maxDate: '',
      minExperience: 0,
      location: '',
      degree: '',
    })
    onClearFilters()
  }

  if (compact) {
    return (
      <div className="hr-filters-container compact">
        <div className="filters-inline">
          <div className="filter-item">
            <label>Date Applied</label>
            <input
              type="date"
              value={filters.minDate}
              onChange={(e) => handleFilterChange('minDate', e.target.value)}
            />
          </div>
          <div className="filter-item">
            <label>Before</label>
            <input
              type="date"
              value={filters.maxDate}
              onChange={(e) => handleFilterChange('maxDate', e.target.value)}
            />
          </div>
          <div className="filter-item">
            <label>Years</label>
            <input
              type="number"
              min="0"
              value={filters.minExperience || ''}
              placeholder="0"
              onChange={(e) =>
                handleFilterChange('minExperience', parseInt(e.target.value) || 0)
              }
            />
          </div>
          <div className="filter-item">
            <label>Location</label>
            <input
              type="text"
              placeholder="Location"
              value={filters.location}
              onChange={(e) => handleFilterChange('location', e.target.value)}
            />
          </div>
          <button onClick={applyFilters} className="btn-apply" disabled={loading}>
            {loading ? '...' : 'Apply'}
          </button>
          <button onClick={clearFilters} className="btn-clear">Clear</button>
        </div>
      </div>
    )
  }

  return (
    <div className="hr-filters-container">
      <div className="filters-card">
        <h2>HR Filters</h2>
        <p className="filters-subtitle">
          Manually filter resumes using simple rules
        </p>

        <div className="filters-grid">
          <div className="filter-group">
            <label htmlFor="min-date">Applied After</label>
            <input
              type="date"
              id="min-date"
              value={filters.minDate}
              onChange={(e) => handleFilterChange('minDate', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="max-date">Applied Before</label>
            <input
              type="date"
              id="max-date"
              value={filters.maxDate}
              onChange={(e) => handleFilterChange('maxDate', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="min-experience">Min Experience (Years)</label>
            <input
              type="number"
              id="min-experience"
              min="0"
              value={filters.minExperience}
              onChange={(e) =>
                handleFilterChange('minExperience', parseInt(e.target.value) || 0)
              }
            />
          </div>

          <div className="filter-group">
            <label htmlFor="location">Location</label>
            <input
              type="text"
              id="location"
              placeholder="e.g., India, Remote"
              value={filters.location}
              onChange={(e) => handleFilterChange('location', e.target.value)}
            />
          </div>

          <div className="filter-group">
            <label htmlFor="degree">Degree Required</label>
            <input
              type="text"
              id="degree"
              placeholder="e.g., B.Tech, MCA"
              value={filters.degree}
              onChange={(e) => handleFilterChange('degree', e.target.value)}
            />
          </div>
        </div>

        <div className="filters-actions">
          <button onClick={applyFilters} className="btn-primary" disabled={loading}>
            {loading ? 'Filtering...' : 'Apply Filters'}
          </button>
          <button onClick={clearFilters} className="btn-secondary">
            Clear Filters
          </button>
        </div>
      </div>
    </div>
  )
}
