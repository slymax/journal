angular.module('app')
  .directive("notesSection", function(){
    return {
      scope: {
        addNew: "&",
        selectionMade: "&",
        tag: "="
      },

      templateUrl: 'notes.html',
      replace: true,
      controller: 'NotesCtrl',
      controllerAs: 'ctrl',
      bindToController: true,

      link:function(scope, elem, attrs, ctrl) {
        scope.$watch('ctrl.tag', function(tag, oldTag){
          if(tag) {
            if(tag.needsLoad) {
              scope.$watch('ctrl.tag.didLoad', function(didLoad){
                if(didLoad) {
                  tag.needsLoad = false;
                  ctrl.tagDidChange(tag, oldTag);
                }
              });
            } else {
              ctrl.tagDidChange(tag, oldTag);
            }
          }
        });
      }
    }
  })
  .controller('NotesCtrl', function (authManager, $timeout, $rootScope, modelManager, storageManager, desktopManager) {

    this.panelController = {};

    $rootScope.$on("user-preferences-changed", () => {
      this.loadPreferences();
    });

    this.loadPreferences = function() {
      let prevSortValue = this.sortBy;

      this.sortBy = authManager.getUserPrefValue("sortBy", "created_at");

      if(this.sortBy == "updated_at") {
        // use client_updated_at instead
        this.sortBy = "client_updated_at";
      }

      if(prevSortValue && prevSortValue != this.sortBy) {
        $timeout(() => {
          this.selectFirstNote();
        })
      }
      this.sortDescending = this.sortBy != "title";

      this.showArchived = authManager.getUserPrefValue("showArchived", false);
      this.hidePinned = authManager.getUserPrefValue("hidePinned", false);
      this.hideNotePreview = authManager.getUserPrefValue("hideNotePreview", false);
      this.hideDate = authManager.getUserPrefValue("hideDate", false);
      this.hideTags = authManager.getUserPrefValue("hideTags", false);

      let width = authManager.getUserPrefValue("notesPanelWidth");
    }

    this.loadPreferences();

    this.onPanelResize = function(newWidth) {
      authManager.setUserPrefValue("notesPanelWidth", newWidth);
      authManager.syncUserPreferences();
    }

    angular.element(document).ready(() => {
      this.loadPreferences();
    });

    $rootScope.$on("editorFocused", function(){
      this.showMenu = false;
    }.bind(this))

    $rootScope.$on("noteDeleted", function() {
      $timeout(this.onNoteRemoval.bind(this));
    }.bind(this))

    $rootScope.$on("noteArchived", function() {
      $timeout(this.onNoteRemoval.bind(this));
    }.bind(this));


    // When a note is removed from the list
    this.onNoteRemoval = function() {
      let visibleNotes = this.visibleNotes();
      if(this.selectedIndex < visibleNotes.length) {
        this.selectNote(visibleNotes[Math.max(this.selectedIndex, 0)]);
      } else {
        this.selectNote(visibleNotes[visibleNotes.length - 1]);
      }
    }

    let MinNoteHeight = 51.0; // This is the height of a note cell with nothing but the title, which *is* a display option
    this.DefaultNotesToDisplayValue = 2500;

    this.paginate = function() {
      this.notesToDisplay += this.DefaultNotesToDisplayValue
    }

    this.resetPagination = function() {
      this.notesToDisplay = this.DefaultNotesToDisplayValue;
    }

    this.resetPagination();

    this.panelTitle = function() {
      if(this.isFiltering()) {
        return `${this.tag.notes.filter((i) => {return i.visible;}).length} search results`;
      } else if(this.tag) {
        return `${this.tag.title} notes`;
      }
    }

    this.optionsSubtitle = function() {
      var base = "";
      if(this.sortBy == "created_at") {
        base += " Date Added";
      } else if(this.sortBy == "client_updated_at") {
        base += " Date Modifed";
      } else if(this.sortBy == "title") {
        base += " Title";
      }

      if(this.showArchived && (!this.tag || !this.tag.archiveTag)) {
        base += " | + Archived"
      }

      if(this.hidePinned) {
        base += " | – Pinned"
      }

      return base;
    }

    this.toggleKey = function(key) {
      this[key] = !this[key];
      authManager.setUserPrefValue(key, this[key]);
      authManager.syncUserPreferences();
    }

    this.tagDidChange = function(tag, oldTag) {
      var scrollable = document.getElementById("notes-scrollable");
      if(scrollable) {
        scrollable.scrollTop = 0;
        scrollable.scrollLeft = 0;
      }

      this.resetPagination();

      this.showMenu = false;

      if(this.selectedNote && this.selectedNote.dummy) {
        if(oldTag) {
          _.remove(oldTag.notes, this.selectedNote);
        }
      }

      this.noteFilter.text = "";
      this.setNotes(tag.notes);
    }

    this.setNotes = function(notes) {
      notes.forEach(function(note){
        note.visible = true;
      })

      var createNew = notes.length == 0;
      this.selectFirstNote(createNew);
    }

    this.visibleNotes = function() {
      return this.sortedNotes.filter(function(note){
        return note.visible;
      });
    }

    this.selectFirstNote = function(createNew) {
      var visibleNotes = this.visibleNotes();

      if(visibleNotes.length > 0) {
        this.selectNote(visibleNotes[0]);
      } else if(createNew) {
        this.createNewNote();
      }
    }

    this.selectNote = function(note, viaClick = false) {
      if(!note) {
        this.createNewNote();
        return;
      }
      this.selectedNote = note;
      note.conflict_of = null; // clear conflict
      this.selectionMade()(note);
      this.selectedIndex = Math.max(this.visibleNotes().indexOf(note), 0);

      if(viaClick && this.isFiltering()) {
        desktopManager.searchText(this.noteFilter.text);
      }
    }

    this.isFiltering = function() {
      return this.noteFilter.text && this.noteFilter.text.length > 0;
    }

    this.createNewNote = function() {
      var date = new Date;
      date = date.toString().slice(4, 15);
      var exists = this.sortedNotes.some(note => {
        return note.created_at.toString().slice(4, 15) == date;
      });
      if (exists) return;
      this.newNote = modelManager.createItem({content_type: "Note", dummy: true, text: ""});
      this.newNote.title = "";
      this.selectNote(this.newNote);
      this.addNew()(this.newNote);
    }

    this.noteFilter = {text : ''};

    this.filterNotes = function(note) {
      if((note.archived && !this.showArchived && !this.tag.archiveTag) || (note.pinned && this.hidePinned)) {
        note.visible = false;
        return note.visible;
      }

      var filterText = this.noteFilter.text.toLowerCase();
      if(filterText.length == 0) {
        note.visible = true;
      } else if (filterText.indexOf("today") > -1) {
        var date = new Date;
        if (filterText[5] == "-") {
          date.setDate(date.getDate() - parseInt(filterText.slice(6) || 0));
        } else if (filterText[5] == "+") {
          date.setDate(date.getDate() + parseInt(filterText.slice(6) || 0));
        }
        note.visible = note.created_at.toString().slice(4, 10) == date.toString().slice(4, 10);
      } else {
        var words = filterText.split(" ");
        var matchesTitle = words.every(function(word) { return  note.safeTitle().toLowerCase().indexOf(word) >= 0; });
        var matchesBody = words.every(function(word) { return  note.safeText().toLowerCase().indexOf(word) >= 0; });
        note.visible = matchesTitle || matchesBody;
      }

      if(this.tag.archiveTag) {
        note.visible = note.visible && note.archived;
      }

      return note.visible;
    }.bind(this)

    this.onFilterEnter = function() {
      // For Desktop, performing a search right away causes input to lose focus.
      // We wait until user explicity hits enter before highlighting desktop search results.
      desktopManager.searchText(this.noteFilter.text);
    }

    this.clearFilterText = function() {
      this.noteFilter.text = '';
      this.onFilterEnter();
      this.filterTextChanged();

      // Reset loaded notes
      this.resetPagination();
    }

    this.filterTextChanged = function() {
      $timeout(function(){
        if(!this.selectedNote.visible) {
          this.selectFirstNote(false);
        }
      }.bind(this), 100)
    }

    this.selectedMenuItem = function($event) {
      this.showMenu = false;
    }

    this.selectedSortByCreated = function() {
      this.setSortBy("created_at");
      this.sortDescending = true;
    }

    this.selectedSortByUpdated = function() {
      this.setSortBy("client_updated_at");
      this.sortDescending = true;
    }

    this.selectedSortByTitle = function() {
      this.setSortBy("title");
      this.sortDescending = false;
    }

    this.setSortBy = function(type) {
      this.sortBy = type;
      authManager.setUserPrefValue("sortBy", this.sortBy);
      authManager.syncUserPreferences();
    }

    this.shouldShowTags = function(note) {
      if(this.hideTags) {
        return false;
      }

      if(this.tag.all) {
        return true;
      }

      // Inside a tag, only show tags string if note contains tags other than this.tag
      return note.tags && note.tags.length > 1;
    }

  });
