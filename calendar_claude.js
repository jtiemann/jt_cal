class CalendarComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    const { BehaviorSubject, combineLatest, fromEvent } = rxjs;
    const { map, debounceTime, distinctUntilChanged, filter } = rxjs.operators;
    
    this.rxjs = { BehaviorSubject, combineLatest, fromEvent };
    this.operators = { map, debounceTime, distinctUntilChanged, filter };
  
    // State streams
    this.currentDate$ = new BehaviorSubject(new Date(2024, 11));
    this.searchTerm$ = new BehaviorSubject('');
    this.selectedDate$ = new BehaviorSubject(null);
    this.categoryFilter$ = new BehaviorSubject('all');
    this.modalState$ = new BehaviorSubject(null); // { type: 'event'|'background', date: string, data?: any }
    this.selectedEvent$ = new BehaviorSubject(null);

    // Default categories
    this.categories = [
      { id: 'work', name: 'Work', color: 'blue' },
      { id: 'personal', name: 'Personal', color: 'green' },
      { id: 'important', name: 'Important', color: 'pink' },
      { id: 'meeting', name: 'Meeting', color: 'purple' },
      { id: 'reminder', name: 'Reminder', color: 'orange' }
    ];

    // Initialize calendar data first
    const storedData = localStorage.getItem('calendarData');
    const defaultData = {
      events: {
        '2024-12-09': [
          { id: '1', time: '10:45', title: 'jon returns', category: 'work', color: 'blue', notes: '' },
          { id: '2', title: '2nd event', category: 'personal', color: 'green', notes: '' }
        ]
      },
      notes: {},
      monthNotes: {},
      cellBackgrounds: {}, // Add storage for cell backgrounds
      categories: this.categories
    };

    // Set calendar data
    this.calendarData = storedData ? JSON.parse(storedData) : defaultData;

    // Initialize streams AFTER calendar data is set
    this.currentDate$ = new BehaviorSubject(new Date(2024, 11));
    this.searchTerm$ = new BehaviorSubject('');
    this.selectedDate$ = new BehaviorSubject(null);
    this.categoryFilter$ = new BehaviorSubject('all');
    this.events$ = new BehaviorSubject(this.calendarData.events);
    this.filteredEvents$ = new BehaviorSubject(this.calendarData.events);

    // Calendar utils
    this.calendarUtils = {
      getDaysInMonth: (date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      },

      getFirstDayOfMonth: (date) => {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
      },

      formatDate: (year, month, day) => {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      },

      generateId: () => {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
      }
    };

    // Initialize subscriptions array
    this.subscriptions = [];

    // Initialize editing states
    this.isEditingMonthNote = false;
  }

  removeExistingModal() {
    const existingModal = this.shadowRoot.querySelector('.event-modal');
    if (existingModal) {
      existingModal.remove();
    }
  }

  getCellBackground(dateStr) {
    return this.calendarData?.cellBackgrounds?.[dateStr] || null;
  }

  updateCellBackground(dateStr, imageData) {
    if (!this.calendarData.cellBackgrounds) {
      this.calendarData.cellBackgrounds = {};
    }
    this.calendarData.cellBackgrounds[dateStr] = imageData;
    this.saveToLocalStorage();
  }

  showBackgroundModal(dateStr) {
    const modal = document.createElement('div');
    modal.className = 'event-modal';

    // Safely get current background
    const currentBackground = this.getCellBackground(dateStr);

    modal.innerHTML = `
      <div class="modal-content">
        <h3>Set Background Image for ${dateStr}</h3>
        <div class="background-options">
          <div class="form-group">
            <label>Upload Local Image:</label>
            <input type="file" accept="image/*" class="image-file-input">
          </div>
          <div class="form-group">
            <label>Or Enter Image URL:</label>
            <input type="text" class="image-url-input" placeholder="https://...">
          </div>
          ${currentBackground ? `
            <div class="form-group">
              <button type="button" class="remove-background">Remove Current Background</button>
            </div>
          ` : ''}
          <div class="preview-container">
            ${currentBackground ? `
              <img src="${currentBackground}" style="max-width: 200px; max-height: 200px;">
            ` : ''}
          </div>
          <div class="button-group">
            <button type="button" class="cancel">Cancel</button>
            <button type="button" class="save" disabled>Save</button>
          </div>
        </div>
      </div>
    `;

    this.shadowRoot.appendChild(modal);

    const fileInput = modal.querySelector('.image-file-input');
    const urlInput = modal.querySelector('.image-url-input');
    const saveButton = modal.querySelector('.save');
    const cancelButton = modal.querySelector('.cancel');
    const removeButton = modal.querySelector('.remove-background');
    const previewContainer = modal.querySelector('.preview-container');

    let currentImageData = null;

    // File input handler
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          currentImageData = e.target.result;
          previewContainer.innerHTML = `<img src="${currentImageData}" style="max-width: 200px; max-height: 200px;">`;
          saveButton.disabled = false;
          urlInput.value = ''; // Clear URL input
        };
        reader.readAsDataURL(file);
      }
    });

    // URL input handler
    urlInput.addEventListener('input', (e) => {
      const url = e.target.value.trim();
      if (url) {
        currentImageData = url;
        previewContainer.innerHTML = `<img src="${url}" style="max-width: 200px; max-height: 200px;" onerror="this.parentElement.innerHTML = 'Invalid image URL'">`;
        saveButton.disabled = false;
        fileInput.value = ''; // Clear file input
      } else {
        saveButton.disabled = true;
      }
    });

    // Remove background handler
    if (removeButton) {
      removeButton.addEventListener('click', () => {
        // Initialize cellBackgrounds if it doesn't exist
        if (!this.calendarData.cellBackgrounds) {
          this.calendarData.cellBackgrounds = {};
        }
        this.calendarData.cellBackgrounds[dateStr] = null;
        this.saveToLocalStorage();
        this.shadowRoot.removeChild(modal);
        this.renderContent();
      });
    }

    // Save handler
    saveButton.addEventListener('click', () => {
      if (currentImageData) {
        // Initialize cellBackgrounds if it doesn't exist
        if (!this.calendarData.cellBackgrounds) {
          this.calendarData.cellBackgrounds = {};
        }
        this.calendarData.cellBackgrounds[dateStr] = currentImageData;
        this.saveToLocalStorage();
        this.shadowRoot.removeChild(modal);
        this.renderContent();
      }
    });

    // Cancel handler
    cancelButton.addEventListener('click', () => {
      this.shadowRoot.removeChild(modal);
    });
  }

  updateMonthNotes(date, notes) {
    const monthNoteKey = this.getMonthNoteKey(date);

    // Initialize monthNotes if it doesn't exist
    if (!this.calendarData.monthNotes) {
      this.calendarData.monthNotes = {};
    }

    this.calendarData.monthNotes[monthNoteKey] = notes;
    this.saveToLocalStorage();
  }

  getYearMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  connectedCallback() {
    this.render();
    this.setupSubscriptions();
  }

  disconnectedCallback() {
    this.subscriptions?.forEach(sub => sub.unsubscribe());
  }

  setupSubscriptions() {
    // Clear any existing subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.subscriptions = [];

    // Set up the filtering subscription with category support
    const modalSub = this.modalState$.pipe(
        this.operators.distinctUntilChanged()
      ).subscribe(modalState => {
        this.removeExistingModal();
        if (modalState) {
          if (modalState.type === 'event') {
            this.showEventModal(modalState.date, modalState.data);
          } else if (modalState.type === 'background') {
            this.showBackgroundModal(modalState.date);
          }
        }
      });

      this.subscriptions.push(modalSub);

      // Selected event subscription
      const selectedEventSub = this.selectedEvent$.pipe(
        this.operators.filter(event => !!event)
      ).subscribe(event => {
        const dateStr = event.date;
        this.modalState$.next({
          type: 'event',
          date: dateStr,
          data: event.data
        });
      });

      this.subscriptions.push(selectedEventSub);

      // Combined state subscription for filtered events
      const filterSub = this.rxjs.combineLatest([
        this.events$,
        this.searchTerm$,
        this.categoryFilter$
      ]).pipe(
        this.operators.debounceTime(100),
        this.operators.map(([events, searchTerm, categoryFilter]) => {
          let filteredEvents = events;

          if (searchTerm) {
            const lowercaseSearch = searchTerm.toLowerCase();
            filteredEvents = Object.fromEntries(
              Object.entries(events).filter(([_, eventList]) => 
                eventList.some(event => 
                  event.title.toLowerCase().includes(lowercaseSearch) ||
                  (event.time || '').toLowerCase().includes(lowercaseSearch)
                )
              )
            );
          }

          if (categoryFilter !== 'all') {
            filteredEvents = Object.fromEntries(
              Object.entries(filteredEvents).filter(([_, eventList]) => 
                eventList.some(event => event.category === categoryFilter)
              )
            );
          }

          return filteredEvents;
        })
      ).subscribe(filteredEvents => {
        this.filteredEvents$.next(filteredEvents);
        if (!this.modalState$.getValue()) {
          this.renderContent();
        }
      });

      this.subscriptions.push(filterSub);


    // Set up date change subscription
    const dateSub = this.currentDate$.subscribe(() => {
      const notesTextarea = this.shadowRoot.querySelector('.notes-textarea');
      const isEditingNotes = notesTextarea === this.shadowRoot.activeElement;

      if (!isEditingNotes) {
        this.renderContent();
      }
    });

    this.subscriptions.push(dateSub);

    // Set up selected date subscription
    const selectedDateSub = this.selectedDate$.subscribe(() => {
      const notesTextarea = this.shadowRoot.querySelector('.notes-textarea');
      const isEditingNotes = notesTextarea === this.shadowRoot.activeElement;

      if (!isEditingNotes) {
        this.renderContent();
      }
    });

    this.subscriptions.push(selectedDateSub);

    // Attach event listeners for DOM interactions
    this.attachEventListeners();
  }

  saveToLocalStorage() {
    localStorage.setItem('calendarData', JSON.stringify(this.calendarData));
    this.events$.next(this.calendarData.events);
  }

  addEvent(dateStr, eventData) {
    if (!this.calendarData.events[dateStr]) {
      this.calendarData.events[dateStr] = [];
    }

    const newEvent = {
      id: this.calendarUtils.generateId(),
      ...eventData
    };

    this.calendarData.events[dateStr].push(newEvent);
    this.saveToLocalStorage();
  }

  editEvent(dateStr, eventId, eventData) {
    if (this.calendarData.events[dateStr]) {
      const eventIndex = this.calendarData.events[dateStr].findIndex(e => e.id === eventId);
      if (eventIndex !== -1) {
        this.calendarData.events[dateStr][eventIndex] = {
          ...this.calendarData.events[dateStr][eventIndex],
          ...eventData
        };
        this.saveToLocalStorage();
      }
    }
  }

  deleteEvent(dateStr, eventId) {
    if (this.calendarData.events[dateStr]) {
      this.calendarData.events[dateStr] = this.calendarData.events[dateStr].filter(
        e => e.id !== eventId
      );
      if (this.calendarData.events[dateStr].length === 0) {
        delete this.calendarData.events[dateStr];
      }
      this.saveToLocalStorage();
    }
  }

  updateNotes(dateStr, notes) {
    this.calendarData.notes[dateStr] = notes;

    // Debounce the localStorage save without triggering a rerender
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      localStorage.setItem('calendarData', JSON.stringify(this.calendarData));
    }, 500);
  }

  navigateMonth(delta) {
    const currentDate = this.currentDate$.getValue();
    const newDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + delta
    );
    this.currentDate$.next(newDate);
  }

  showEventModal(dateStr, existingEvent = null) {
    const modal = document.createElement('div');
    modal.className = 'event-modal';

    const isEditing = !!existingEvent;

    modal.innerHTML = `
      <div class="modal-content">
        <h3>${isEditing ? 'Edit Event' : 'Add Event'} for ${dateStr}</h3>
        <form id="eventForm">
          <div class="form-group">
            <label>Title:</label>
            <input type="text" name="title" required value="${isEditing ? existingEvent.title : ''}">
          </div>
          <div class="form-group">
            <label>Category:</label>
            <select name="category" class="category-select">
              ${this.categories.map(cat => `
                <option value="${cat.id}" 
                  ${isEditing && existingEvent.category === cat.id ? 'selected' : ''}
                  data-color="${cat.color}">
                  ${cat.name}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Time:</label>
            <input type="time" name="time" value="${isEditing && existingEvent.time ? existingEvent.time : ''}">
          </div>
          <div class="form-group">
            <label>Notes:</label>
            <textarea name="notes" rows="3">${isEditing && existingEvent.notes ? existingEvent.notes : ''}</textarea>
          </div>
          <div class="button-group">
            ${isEditing ? '<button type="button" class="delete">Delete</button>' : ''}
            <button type="button" class="cancel">Cancel</button>
            <button type="submit">${isEditing ? 'Save' : 'Add'} Event</button>
          </div>
        </form>
      </div>
    `;

    this.shadowRoot.appendChild(modal);

    // Auto-set color based on category
    const categorySelect = modal.querySelector('.category-select');
    const updateEventColor = () => {
      const option = categorySelect.selectedOptions[0];
      return option.dataset.color;
    };

    // Form submission
    const form = modal.querySelector('#eventForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(form);

      const eventData = {
        title: formData.get('title'),
        time: formData.get('time'),
        category: formData.get('category'),
        color: updateEventColor(),
        notes: formData.get('notes')
      };

      if (isEditing) {
        this.editEvent(dateStr, existingEvent.id, eventData);
      } else {
        this.addEvent(dateStr, eventData);
      }

      this.shadowRoot.removeChild(modal);
      this.renderContent();
    });

    // Delete button
    const deleteBtn = modal.querySelector('.delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this event?')) {
          this.deleteEvent(dateStr, existingEvent.id);
          this.shadowRoot.removeChild(modal);
          this.renderContent();
        }
      });
    }

    // Cancel button
    modal.querySelector('.cancel').addEventListener('click', () => {
      this.shadowRoot.removeChild(modal);
    });
  }

  renderMiniCalendar(date) {
    const daysInMonth = this.calendarUtils.getDaysInMonth(date);
    const firstDay = this.calendarUtils.getFirstDayOfMonth(date);
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const blanks = Array(firstDay).fill(null);
    const cells = [...blanks, ...days];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    return `
      <div class="mini-calendar">
        <div class="mini-calendar-header">
          ${months[date.getMonth()]} ${date.getFullYear()}
        </div>
        <div class="mini-calendar-days">
          <div>S</div><div>M</div><div>T</div><div>W</div><div>T</div><div>F</div><div>S</div>
        </div>
        <div class="mini-calendar-grid">
          ${cells.map(day => `
            <div class="mini-calendar-cell${day ? '' : ' empty'}">
              ${day || ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  getMonthNoteKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  renderHeader() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const currentDate = this.currentDate$.getValue();

    // Safely get month notes
    const monthNoteKey = this.getMonthNoteKey(currentDate);
    const monthNotes = this.calendarData?.monthNotes?.[monthNoteKey] || '';

    const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);

    return `
      <div class="header">
        <div class="search-section">
          <input type="text" placeholder="Search events..." class="search-input">
          <div class="filters">
            <select class="category-filter">
              <option value="all">All Categories</option>
              ${this.categories.map(cat => `
                <option value="${cat.id}">${cat.name}</option>
              `).join('')}
            </select>
          </div>
        </div>
        
        <div class="mobile-nav">
          <button class="prev-month">← Previous</button>
          <button class="next-month">Next →</button>
        </div>

        <div class="month-navigation">
          <div class="mini-calendar-container prev-month">
            ${this.renderMiniCalendar(prevMonth)}
          </div>
          <div class="month-header">
            <h2 class="month-title" role="button" tabindex="0">
              ${months[currentDate.getMonth()]} ${currentDate.getFullYear()}
            </h2>
            ${this.isEditingMonthNote ? `
              <div class="month-notes-editor">
                <textarea class="month-notes-textarea" placeholder="Add notes for this month...">${monthNotes}</textarea>
                <div class="month-notes-actions">
                  <button class="save-month-notes">Save</button>
                  <button class="cancel-month-notes">Cancel</button>
                </div>
              </div>
            ` : monthNotes ? `
              <div class="month-notes" role="button" tabindex="0">
                ${monthNotes}
              </div>
            ` : `
              <button class="add-month-notes">+ Add Month Notes</button>
            `}
          </div>
          <div class="mini-calendar-container next-month">
            ${this.renderMiniCalendar(nextMonth)}
          </div>
        </div>
      </div>
    `;
  }

  renderDayHeaders() {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return `
      <div class="days-header">
        ${days.map(day => `<div class="day-header">${day}</div>`).join('')}
      </div>
    `;
  }

  renderCalendarGrid() {
    const currentDate = this.currentDate$.getValue();
    const events = this.filteredEvents$.getValue();
    const selectedDate = this.selectedDate$.getValue();
    
    const daysInMonth = this.calendarUtils.getDaysInMonth(currentDate);
    const firstDay = this.calendarUtils.getFirstDayOfMonth(currentDate);
    
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dateStr = this.calendarUtils.formatDate(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        day
      );
      return {
        day,
        dateStr,
        events: events[dateStr] || []
      };
    });

    const blanks = Array(firstDay).fill(null);
    const cells = [...blanks, ...days];

    return `
      <div class="calendar-grid">
        ${cells.map(cell => {
          if (!cell) return '<div class="calendar-cell empty"></div>';
          
          const isSelected = cell.dateStr === selectedDate;
          const backgroundImage = this.getCellBackground(cell.dateStr);
          const backgroundStyle = backgroundImage ? 
            `style="background-image: url('${backgroundImage}'); background-repeat: no-repeat; background-size: contain; background-position: center no-repeat;"` : '';
          const hasBackground = backgroundImage ? ' has-background' : '';
          
          return `
            <div class="calendar-cell${isSelected ? ' selected' : ''}${hasBackground}" 
                 data-date="${cell.dateStr}">
              <div class="cell-content" ${backgroundStyle}>
                <div class="date-header">
                  <div class="date" role="button" tabindex="0">${cell.day}</div>
                  <button class="set-background" title="Set Background Image">🖼️</button>
                </div>
                <div class="events">
                  ${cell.events.map(event => `
                    <div class="event ${event.color}" 
                         role="button" 
                         tabindex="0"
                         data-event-id="${event.id}">
                      ${event.time ? `<span class="time">${event.time} - </span>` : ''}
                      ${event.title}
                      <div class="event-category">${this.categories.find(cat => cat.id === event.category)?.name}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderNotes() {
    const selectedDate = this.selectedDate$.getValue();
    if (!selectedDate) return '';

    const events = this.calendarData.events[selectedDate] || [];
    const notes = this.calendarData.notes[selectedDate] || '';

    return `
      <div class="notes-section">
        <h3>Notes for ${selectedDate}</h3>
        <div class="notes-container">
          <div class="events-list">
            <h4>Events</h4>
            ${events.map(event => `
              <div class="event ${event.color}">
                <div class="event-header">
                  <div class="event-title">
                    ${event.time ? `<span class="time">${event.time} - </span>` : ''}
                    ${event.title}
                    <div class="event-category">${this.categories.find(cat => cat.id === event.category)?.name}</div>
                  </div>
                  <button class="edit-event" data-event-id="${event.id}">Edit</button>
                </div>
                ${event.notes ? `<div class="event-notes">${event.notes}</div>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="notes-editor">
            <h4>Notes</h4>
            <textarea class="notes-textarea" placeholder="Add notes for this day...">${notes}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  renderNotesContent() {
    const selectedDate = this.selectedDate$.getValue();
    if (!selectedDate) return;

    const events = this.calendarData.events[selectedDate] || [];
    const notes = this.calendarData.notes[selectedDate] || '';

    const notesSection = this.shadowRoot.querySelector('.notes-section');
    if (notesSection) {
      notesSection.innerHTML = `
        <h3>Notes for ${selectedDate}</h3>
        <div class="notes-container">
          <div class="events-list">
            <h4>Events</h4>
            ${events.map(event => `
              <div class="event ${event.color}">
                <div class="event-header">
                  <div class="event-title">
                    ${event.time ? `<span class="time">${event.time} - </span>` : ''}
                    ${event.title}
                    <div class="event-category">${this.categories.find(cat => cat.id === event.category)?.name}</div>
                  </div>
                  <button class="edit-event" data-event-id="${event.id}">Edit</button>
                </div>
                ${event.notes ? `<div class="event-notes">${event.notes}</div>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="notes-editor">
            <h4>Notes</h4>
            <textarea class="notes-textarea" placeholder="Add notes for this day...">${notes}</textarea>
          </div>
        </div>
      `;
    }
  }

  renderContent() {
    const calendarContent = this.shadowRoot.querySelector('.calendar');
    if (!calendarContent) return;

    const notesSection = this.shadowRoot.querySelector('.notes-section');
    const notesTextarea = notesSection?.querySelector('.notes-textarea');
    const isEditingNotes = notesTextarea === this.shadowRoot.activeElement;

    if (isEditingNotes) {
      // Only update non-notes content
      const calendarGrid = this.shadowRoot.querySelector('.calendar-grid');
      if (calendarGrid) {
        calendarGrid.innerHTML = this.renderCalendarGrid();
      }
    } else {
      // Full render when not editing notes
      calendarContent.innerHTML = `
        ${this.renderHeader()}
        ${this.renderDayHeaders()}
        ${this.renderCalendarGrid()}
        ${this.renderNotes()}
      `;
    }

    this.attachEventListeners();
  }

  showEventModal(dateStr, existingEvent = null) {
    this.removeExistingModal();
  
    const modal = document.createElement('div');
    modal.className = 'event-modal';
    
    const isEditing = !!existingEvent;
    
    modal.innerHTML = `
      <div class="modal-content">
        <h3>${isEditing ? 'Edit Event' : 'Add Event'} for ${dateStr}</h3>
        <form id="eventForm">
          <div class="form-group">
            <label>Title:</label>
            <input type="text" name="title" required value="${isEditing ? existingEvent.title : ''}">
          </div>
          <div class="form-group">
            <label>Category:</label>
            <select name="category" class="category-select">
              ${this.categories.map(cat => `
                <option value="${cat.id}" 
                  ${isEditing && existingEvent.category === cat.id ? 'selected' : ''}
                  data-color="${cat.color}">
                  ${cat.name}
                </option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Time:</label>
            <input type="time" name="time" value="${isEditing && existingEvent.time ? existingEvent.time : ''}">
          </div>
          <div class="form-group">
            <label>Notes:</label>
            <textarea name="notes" rows="3">${isEditing && existingEvent.notes ? existingEvent.notes : ''}</textarea>
          </div>
          <div class="button-group">
            ${isEditing ? '<button type="button" class="delete">Delete</button>' : ''}
            <button type="button" class="cancel">Cancel</button>
            <button type="submit">${isEditing ? 'Save' : 'Add'} Event</button>
          </div>
        </form>
      </div>
    `;
  
    this.shadowRoot.appendChild(modal);
  
    const form = modal.querySelector('#eventForm');
    const deleteBtn = modal.querySelector('.delete');
    const cancelBtn = modal.querySelector('.cancel');
  
    // Form submission stream
    const submitSub = this.rxjs.fromEvent(form, 'submit').pipe(
      this.operators.map(e => {
        e.preventDefault();
        const formData = new FormData(form);
        
        return {
          title: formData.get('title'),
          time: formData.get('time'),
          category: formData.get('category'),
          color: form.querySelector('option:checked').dataset.color,
          notes: formData.get('notes')
        };
      })
    ).subscribe(eventData => {
      if (isEditing) {
        this.editEvent(dateStr, existingEvent.id, eventData);
      } else {
        this.addEvent(dateStr, eventData);
      }
      this.modalState$.next(null);
      this.renderContent();
    });
  
    this.subscriptions.push(submitSub);
  
    // Delete button stream
    if (deleteBtn) {
      const deleteSub = this.rxjs.fromEvent(deleteBtn, 'click').pipe(
        this.operators.filter(() => confirm('Are you sure you want to delete this event?'))
      ).subscribe(() => {
        this.deleteEvent(dateStr, existingEvent.id);
        this.modalState$.next(null);
        this.renderContent();
      });
  
      this.subscriptions.push(deleteSub);
    }
  
    // Cancel button stream
    const cancelSub = this.rxjs.fromEvent(cancelBtn, 'click').subscribe(() => {
      this.modalState$.next(null);
    });
  
    this.subscriptions.push(cancelSub);
  
    // Category change stream for color updates
    const categorySelect = form.querySelector('.category-select');
    const categoryChangeSub = this.rxjs.fromEvent(categorySelect, 'change').pipe(
      this.operators.map(e => e.target.selectedOptions[0].dataset.color)
    ).subscribe(color => {
      // Could update a preview or other UI elements based on category color
    });
  
    this.subscriptions.push(categoryChangeSub);
  
    // Escape key stream for closing modal
    const escapeKeySub = this.rxjs.fromEvent(window, 'keydown').pipe(
      this.operators.filter(e => e.key === 'Escape')
    ).subscribe(() => {
      this.modalState$.next(null);
    });
  
    this.subscriptions.push(escapeKeySub);
  
    // Click outside modal to close
    const outsideClickSub = this.rxjs.fromEvent(modal, 'click').pipe(
      this.operators.filter(e => e.target === modal)
    ).subscribe(() => {
      this.modalState$.next(null);
    });
  
    this.subscriptions.push(outsideClickSub);
  
    // Focus first input
    setTimeout(() => {
      form.querySelector('input[name="title"]').focus();
    }, 0);
  }

  attachEventListeners() {

    if (this.boundEventListeners) {
      this.boundEventListeners.forEach(({element, type, listener}) => {
        element.removeEventListener(type, listener);
      });
    }

    this.boundEventListeners = [];

    // Search input
    const searchInput = this.shadowRoot.querySelector('.search-input');
    if (searchInput) {
      const searchSub = this.rxjs.fromEvent(searchInput, 'input')
        .pipe(
          this.operators.map(e => e.target.value),
          this.operators.debounceTime(300),
          this.operators.distinctUntilChanged()
        )
        .subscribe(term => this.searchTerm$.next(term));

      this.subscriptions.push(searchSub);
    }

    // Category filter
    const categoryFilter = this.shadowRoot.querySelector('.category-filter');
    if (categoryFilter) {
      const categorySub = this.rxjs.fromEvent(categoryFilter, 'change')
        .pipe(
          this.operators.map(e => e.target.value)
        )
        .subscribe(category => this.categoryFilter$.next(category));

      this.subscriptions.push(categorySub);
    }

    // Mini calendar navigation
    const prevMiniCal = this.shadowRoot.querySelector('.mini-calendar-container.prev-month');
    const nextMiniCal = this.shadowRoot.querySelector('.mini-calendar-container.next-month');

    if (prevMiniCal && nextMiniCal) {
      const prevSub = this.rxjs.fromEvent(prevMiniCal, 'click')
        .subscribe(() => this.navigateMonth(-1));

      const nextSub = this.rxjs.fromEvent(nextMiniCal, 'click')
        .subscribe(() => this.navigateMonth(1));

      this.subscriptions.push(prevSub, nextSub);
    }

    // Event click handlers

    this.shadowRoot.querySelectorAll('.event').forEach(eventEl => {
      const clickSub = this.rxjs.fromEvent(eventEl, 'click').pipe(
        this.operators.map(e => {
          e.stopPropagation();
          const eventId = eventEl.dataset.eventId;
          const dateStr = eventEl.closest('.calendar-cell').dataset.date;
          const event = this.calendarData.events[dateStr]?.find(ev => ev.id === eventId);
          return { date: dateStr, data: event };
        }),
        this.operators.filter(event => !!event.data)
      ).subscribe(event => {
        this.selectedEvent$.next(event);
      });
  
      this.subscriptions.push(clickSub);
    });
  
    // Background image button handlers
    this.shadowRoot.querySelectorAll('.set-background').forEach(button => {
      const clickSub = this.rxjs.fromEvent(button, 'click').pipe(
        this.operators.map(e => {
          e.stopPropagation();
          return e.target.closest('.calendar-cell').dataset.date;
        })
      ).subscribe(dateStr => {
        this.modalState$.next({
          type: 'background',
          date: dateStr
        });
      });
  
      this.subscriptions.push(clickSub);
    });
  
    // Date click handlers for new events
    this.shadowRoot.querySelectorAll('.date').forEach(dateEl => {
      const clickSub = this.rxjs.fromEvent(dateEl, 'click').pipe(
        this.operators.map(e => {
          e.stopPropagation();
          return e.target.closest('.calendar-cell').dataset.date;
        })
      ).subscribe(dateStr => {
        this.modalState$.next({
          type: 'event',
          date: dateStr
        });
      });
  
      this.subscriptions.push(clickSub);
    });
  
    // Calendar cell selection
    this.shadowRoot.querySelectorAll('.calendar-cell').forEach(cell => {
      const clickSub = this.rxjs.fromEvent(cell, 'click').pipe(
        this.operators.filter(e => 
          !e.target.closest('.event') && 
          !e.target.classList.contains('date') &&
          !e.target.classList.contains('set-background')
        ),
        this.operators.map(e => e.target.closest('.calendar-cell').dataset.date)
      ).subscribe(dateStr => {
        if (dateStr) {
          this.selectedDate$.next(dateStr);
          this.renderContent();
        }
      });
  
      this.subscriptions.push(clickSub);
    });

    // Event edit buttons
    this.shadowRoot.querySelectorAll('.edit-event').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const eventId = button.dataset.eventId;
        const selectedDate = this.selectedDate$.getValue();
        const event = this.calendarData.events[selectedDate].find(e => e.id === eventId);
        if (event) {
          this.showEventModal(selectedDate, event);
        }
      });
    });

    // Notes textarea handler
    const notesTextarea = this.shadowRoot.querySelector('.notes-textarea');
    if (notesTextarea) {
      const selectedDate = this.selectedDate$.getValue();

      notesTextarea.addEventListener('input', (e) => {
        // Just update the data without triggering a rerender
        this.updateNotes(selectedDate, e.target.value);
      });
    }

    // Month notes handlers
    const monthTitle = this.shadowRoot.querySelector('.month-title');
    const monthNotes = this.shadowRoot.querySelector('.month-notes');
    const addMonthNotesBtn = this.shadowRoot.querySelector('.add-month-notes');
    const saveMonthNotesBtn = this.shadowRoot.querySelector('.save-month-notes');
    const cancelMonthNotesBtn = this.shadowRoot.querySelector('.cancel-month-notes');
    const monthNotesTextarea = this.shadowRoot.querySelector('.month-notes-textarea');

    const startEditing = () => {
      this.isEditingMonthNote = true;
      this.renderContent();
    };

    if (monthTitle) {
      monthTitle.addEventListener('click', startEditing);
    }

    if (monthNotes) {
      monthNotes.addEventListener('click', startEditing);
    }

    if (addMonthNotesBtn) {
      addMonthNotesBtn.addEventListener('click', startEditing);
    }

    if (saveMonthNotesBtn && monthNotesTextarea) {
      saveMonthNotesBtn.addEventListener('click', () => {
        const currentDate = this.currentDate$.getValue();
        this.updateMonthNotes(currentDate, monthNotesTextarea.value);
        this.isEditingMonthNote = false;
        this.renderContent();
      });
    }

    if (cancelMonthNotesBtn) {
      cancelMonthNotesBtn.addEventListener('click', () => {
        this.isEditingMonthNote = false;
        this.renderContent();
      });
    }
  }

  render() {
    const styles = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          width: 100%;
          max-width: 1200px;
          margin: 0 auto;
          padding: 1rem;
          box-sizing: border-box;
        }
        
        h2.month-title {
          background-size: contain;
          background-image: url(https://th.bing.com/th?id=OIP.bdalFvlnTxdKt1TfIWr-PQHaE6&w=306&h=203&c=8&rs=1&qlt=90&o=6&dpr=1.5&pid=3.1&rm=2);
        }

        .calendar {
          display: flex;
          flex-direction: column;
          width: 100%;
          box-sizing: border-box;
        }
        
        .header {
          margin-bottom: 1.5rem;
          width: 100%;
        }
        
        .search-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
          width: 100%;
          gap: 1rem;
          flex-wrap: wrap;
        }
        
        .search-input {
          flex: 1;
          min-width: 200px;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .filters {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        
        .filters select {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        
        .month-navigation {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2rem;
          padding: 1rem 0;
          width: 100%;
          box-sizing: border-box;
        }

        .month-navigation h2 {
          flex: 0 0 200px;
          text-align: center;
          margin: 0;
          font-size: 1.5rem;
        }

        .mini-calendar-container {
          cursor: pointer;
          opacity: 0.7;
          transition: opacity 0.2s;
        }

        .mini-calendar-container:hover {
          opacity: 1;
        }

        .mini-calendar {
          width: 200px;
          flex-shrink: 0;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 0.5rem;
          box-sizing: border-box;
        }

        .mini-calendar-header {
          text-align: center;
          font-weight: 500;
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
        }

        .mini-calendar-days {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          text-align: center;
          font-size: 0.8rem;
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .mini-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 1px;
        }

        .mini-calendar-cell {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          padding: 0.25rem;
        }

        .mini-calendar-cell.empty {
          background: #f8f9fa;
        }
        
        .days-header {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          margin-bottom: 0.5rem;
        }
        
        .day-header {
          padding: 0.5rem;
          text-align: center;
          font-weight: 500;
        }
        
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 1px;
          background-color: #eee;
          border: 1px solid #eee;
          width: 100%;
          box-sizing: border-box;
        }
        
        .calendar-cell {
          position: relative;
          min-height: 8rem;
          padding: 0.5rem;
          cursor: pointer;
          width: 100%;
          box-sizing: border-box;
          background: white; /* Default background */
          transition: background-color 0.3s ease;
        }

        .calendar-cell[style*="background-image"] {
          background-color: transparent !important; /* Override any other background colors */
        }
                
        .calendar-cell.empty {
          background: white;
          cursor: default;
        }
        
        .calendar-cell.selected {
          background: #e3f2fd;
        }
        
        .date {
          font-weight: 500;
          margin-bottom: 0.25rem;
          display: inline-block;
          padding: 0.25rem;
          border-radius: 4px;
          cursor: pointer;
        }

        .date:hover {
          background: #e9ecef;
        }
        
        .events {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        
        .event {
          padding: 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
          margin-bottom: 0.25rem;
          cursor: pointer;
          transition: transform 0.1s ease-in-out, box-shadow 0.1s ease-in-out;
          user-select: none;
        }

        .event:hover {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .event:focus {
          outline: 2px solid #4a90e2;
          outline-offset: 2px;
        }

        .event:active {
          transform: translateY(0);
          box-shadow: none;
        }
        
        .event.blue { background-color: #e3f2fd; }
        .event.green { background-color: #e0f2e9; }
        .event.pink { background-color: #fce4ec; }
        .event.purple { background-color: #f3e5f5; }
        .event.orange { background-color: #fff3e0; }

        .event-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .event-title {
          flex: 1;
        }

        .event-category {
          font-size: 0.75rem;
          color: #666;
          margin-top: 0.25rem;
        }
        
        .notes-section {
          margin-top: 2rem;
          width: 100%;
          box-sizing: border-box;
        }
        
        .notes-container {
          background-color: #f8f9fa;
          padding: 1rem;
          border-radius: 4px;
          width: 100%;
          box-sizing: border-box;
        }
        
        .events-list {
          margin-bottom: 1rem;
        }
        
        .notes-editor {
          margin-top: 1rem;
          width: 100%;
          box-sizing: border-box;
        }
        
        .notes-textarea {
          width: 100%;
          min-height: 100px;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          resize: vertical;
          margin-top: 0.5rem;
          box-sizing: border-box;
          font-family: inherit;
          font-size: 0.9rem;
          line-height: 1.5;
        }

        .edit-event {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          padding: 2px 6px;
          font-size: 0.8rem;
          border-radius: 3px;
        }

        .edit-event:hover {
          background: rgba(0, 0, 0, 0.1);
        }

        .event-notes {
          margin-top: 0.25rem;
          padding: 0.25rem;
          font-size: 0.8rem;
          color: #666;
          background: rgba(0, 0, 0, 0.05);
          border-radius: 2px;
        }

        .time {
          font-weight: 500;
        }

        .mobile-nav {
          display: none;
        }

        /* Modal styles */
        .event-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: white;
          padding: 2rem;
          border-radius: 8px;
          min-width: 300px;
          max-width: 500px;
          width: 90%;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.9rem;
          box-sizing: border-box;
        }

        .button-group {
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          margin-top: 1.5rem;
        }

        .button-group button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
        }

        .button-group button[type="submit"] {
          background: #4caf50;
          color: white;
        }

        .button-group button.cancel {
          background: #f44336;
          color: white;
        }

        .button-group button.delete {
          background: #f44336;
          color: white;
          margin-right: auto;
        }

        /* Responsive styles */
        @media (max-width: 1024px) {
          .month-navigation {
            justify-content: center;
          }
          
          .mini-calendar {
            width: 180px;
          }

          .calendar-cell {
            min-height: 6rem;
          }
        }

        @media (max-width: 768px) {
          .month-navigation {
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }

          .mini-calendar-container {
            display: none;
          }

          .mobile-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            width: 100%;
            margin-bottom: 1rem;
          }

          .mobile-nav button {
            padding: 0.5rem 1rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
            cursor: pointer;
          }

          .month-navigation h2 {
            order: -1;
            margin: 0;
          }

          .calendar-grid {
            font-size: 0.9rem;
          }

          .event {
            font-size: 0.8rem;
            padding: 0.25rem;
          }

          .search-section {
            flex-direction: column;
          }

          .search-input {
            width: 100%;
          }

          .filters {
            width: 100%;
            justify-content: stretch;
          }

          .filters select {
            flex: 1;
          }
        }

        @media (max-width: 480px) {
          .calendar {
            font-size: 0.9rem;
          }

          .days-header .day-header {
            font-size: 0.8rem;
            padding: 0.25rem;
          }

          .calendar-cell {
            min-height: 4rem;
            padding: 0.25rem;
          }

          .date {
            font-size: 0.9rem;
            margin-bottom: 0.125rem;
          }

          .event {
            font-size: 0.75rem;
            margin-bottom: 0.125rem;
          }

          .event-category {
            display: none;
          }

          .notes-section {
            margin-top: 1rem;
          }

          .notes-textarea {
            min-height: 80px;
          }
        }

        @media print {
          .mini-calendar-container,
          .search-section,
          .mobile-nav {
            display: none;
          }

          .calendar-cell {
            border: 1px solid #ddd;
          }

          .event {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }

        .month-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          min-width: 200px;
        }

        .month-title,
        .month-notes {
          font-size: 1.5rem;
          margin: 0;
          font-weight: 500;
          cursor: pointer;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          text-align: center;
        }

        .month-notes {
          color: #333;
          padding: 0.5rem;
          background: #f8f9fa;
          border-radius: 4px;
          max-width: 300px;
          transition: background-color 0.2s;
        }

        .month-title:hover,
        .month-notes:hover {
          background: #f0f0f0;
        }

        .month-notes-editor {
          width: 100%;
          max-width: 300px;
        }

        .add-month-notes {
          background: none;
          border: 1px dashed #ddd;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          color: #666;
          cursor: pointer;
          font-size: 1.5rem;
          font-weight: 500;
          margin: 0;
        }

        .add-month-notes:hover {
          background: #f8f9fa;
          border-color: #999;
        }

        .month-notes-textarea {
          width: 100%;
          min-height: 60px;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          resize: vertical;
          margin-bottom: 0.5rem;
          font-family: inherit;
          font-size: 1.5rem;
        }

        @media (max-width: 768px) {
          .month-notes,
          .month-notes-editor {
            max-width: 100%;
          }

          .month-title,
          .month-notes,
          .add-month-notes {
            font-size: 1.25rem;
          }
        }

        .calendar-cell {
    position: relative;
    background: white;
    min-height: 8rem;
    padding: 0.5rem;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
  }

.cell-content {
  position: relative;
  z-index: 1;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.85); /* Semi-transparent white background */
  border-radius: 4px;
  padding: 0.25rem;
  backdrop-filter: blur(2px); /* Add slight blur to background */
}

  .date-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .set-background {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .set-background:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }

  .preview-container {
    margin: 1rem 0;
    text-align: center;
  }

  .preview-container img {
    border-radius: 4px;
    border: 1px solid #ddd;
  }

  .remove-background {
    background: #f44336;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    width: 100%;
    margin-top: 0.5rem;
  }

  .remove-background:hover {
    background: #d32f2f;
  }
      </style>
    `;

    this.shadowRoot.innerHTML = `
      ${styles}
      <div class="calendar">
        ${this.renderHeader()}
        ${this.renderDayHeaders()}
        ${this.renderCalendarGrid()}
        ${this.renderNotes()}
      </div>
    `;

    this.attachEventListeners();
  }
}

// Register the custom element
customElements.define('calendar-component', CalendarComponent);